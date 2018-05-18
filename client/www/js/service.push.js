/**
 * Created by aleckim on 2016. 5. 1..
 */

angular.module('service.push', [])
    .factory('Push', function($http, TwStorage, Util, WeatherUtil, WeatherInfo, $location, Units, $rootScope, Firebase) {
        var obj = {};
        // obj.config = {
        //     "android": {
        //         "senderID": clientConfig.googleSenderId
        //         //"icon": "TodayWeather",
        //         //"iconColor": "blue"
        //         //"forceShow": true,
        //     },
        //     "ios": {
        //         "alert": "true",
        //         "badge": "true",
        //         "sound": "true",
        //         "clearBadge": "true"
        //     },
        //     "windows": {}
        // };

        obj.inited = false;
        obj.pushUrl = clientConfig.serverUrl + '/v000902'+'/push';
        obj.pushListUrl = clientConfig.serverUrl + '/v000902'+'/push-list';

        /**
         * type is 'android' or 'ios'
         * @type {{registrationId: string, type: string, category: string, pushList: Array}}
         */
        obj.pushData = {registrationId: null, type: '', category:'', fcmToken: null, pushList: []};

        /**
         * units 변경시에 push 갱신 #1845
         */
        obj.updateUnits = function () {
            var self = this;
            if (self.pushData.pushList.length > 0) {
                Util.ga.trackEvent('push', 'update', 'units');
                self._postPushList(self.pushData.pushList);
            }
        };

        /**
         * alert 들어오기 전 format
         */
        obj.loadOldPushInfo = function () {
            var self = this;
            var pushData = TwStorage.get("pushData");
            if (pushData != null) {
                self.pushData.registrationId = pushData.registrationId;
                self.pushData.type = pushData.type;

                var alertList = pushData.alarmList.map(function (pushInfo) {
                    var alertInfo = self.newPushAlert(1, pushInfo.cityIndex, 7, 22);
                    alertInfo.enable = false;
                    return alertInfo;
                });

                var alarmList = pushData.alarmList.map(function (pushInfo) {
                    pushInfo.time = new Date(pushInfo.time);
                    pushInfo.category = 'alarm';
                    pushInfo.id = pushInfo.cityIndex+1;
                    pushInfo.enable = true;
                    pushInfo.dayOfWeek = [true, true, true, true, true, true, true];
                    return pushInfo;
                });

                self.pushData.pushList = alertList.concat(alarmList);

                //update alarmInfo to server for sync
                if (self.pushData.pushList.length > 0) {
                    setTimeout(function() {
                        self._postPushList(self.pushData.pushList);
                    }, 3000);
                }
            }
            console.log('load push data');
            console.log(JSON.stringify({pushList:self.pushData.pushList}));
            return pushData;
        };

        /**
         * alert, alarm이 함께 pushList에 들어감
         */
        obj.loadPushInfo = function () {
            var self = this;
            var pushData = TwStorage.get("pushData2");
            if (pushData != null) {
                self.pushData.registrationId = pushData.registrationId;
                self.pushData.fcmToken = pushData.fcmToken;
                self.pushData.type = pushData.type;
                self.pushData.pushList = pushData.pushList;
                self.pushData.pushList.forEach(function (pushInfo) {
                    if (pushInfo.category === 'alarm') {
                        pushInfo.time = new Date(pushInfo.time);
                    }
                    else if (pushInfo.category === 'alert') {
                        pushInfo.startTime = new Date(pushInfo.startTime);
                        pushInfo.endTime = new Date(pushInfo.endTime);
                    }
                });

                //update alarmInfo to server for sync
                if (self.pushData.pushList.length > 0) {
                    setTimeout(function() {
                        self._postPushList(self.pushData.pushList);
                    }, 3000);
                }
            }
            console.log('load push data2');
            console.log(JSON.stringify({pushList:self.pushData.pushList}));

            return pushData;
        };

        obj.savePushInfo = function () {
            var self = this;
            console.log('save push data');
            TwStorage.set("pushData2", self.pushData);
        };

        /**
         * alert의 경우 startTime과 endTime이 동일하면 endTime을 1분 뺀다.
         * 지금 one-way sync이기 때문에 문제가 없지만 two-way sync하면 문제가 됨.
         * @param {{id:number, name:string, location: number[], town: {}, source: string, time: date, startTime: date, endTime: date}} pushInfo
         * @returns {{registrationId: string, type: string, cityIndex: number, id: number, name: string, location: number[], town: object, source: string, units: {temperatureUnit, windSpeedUnit, pressureUnit, distanceUnit, precipitationUnit, airUnit}}}
         * @private
         */
        obj._makePostObj = function (pushInfo) {
            var postObj;

            console.log(pushInfo);
            var units = Units.getAllUnits();
            units.airForecastSource = 'kaq';

            /**
             * 기존 호환성때문에 cityIndex로 되어 있지만, alert지원부터 registrationId내에서 유일한 ID임.
             */
            postObj  = {
                type: this.pushData.type,
                cityIndex: pushInfo.cityIndex,
                id: pushInfo.id,
                category: pushInfo.category,
                enable: pushInfo.enable,
                name: pushInfo.name,
                location: pushInfo.location,       //lat, long
                town: pushInfo.town,               //first, second, third
                source: pushInfo.source,           //KMA or DSF, ...
                units: units,
                timezoneOffset: new Date().getTimezoneOffset()*-1,   //+9이면 -9로 결과가 나오기 때문에 뒤집어야 함.
                package: clientConfig.package
            };
            if (this.pushData.registrationId) {
                postObj.registrationId = this.pushData.registrationId;
            }
            if (this.pushData.fcmToken) {
                postObj.fcmToken = this.pushData.fcmToken;
            }

            if (pushInfo.category === 'alarm') {
                postObj.pushTime = this.date2utcSecs(pushInfo.time);
                postObj.dayOfWeek = pushInfo.dayOfWeek;
            }
            else if (pushInfo.category === 'alert') {
                postObj.startTime = this.date2utcSecs(pushInfo.startTime);
                postObj.endTime = this.date2utcSecs(pushInfo.endTime);
                if (postObj.startTime === postObj.endTime) {
                    var endTimeObj = new Date(pushInfo.endTime.getTime());
                    endTimeObj.setMinutes(endTimeObj.getMinutes()-1);
                    postObj.endTime = this.date2utcSecs(endTimeObj);
                }
                //set unhealthy
                if (postObj.units.airUnit === 'airkorea' || postObj.units.airUnit === 'airkorea_who') {
                    postObj.airAlertsBreakPoint = 3;
                }
                else {
                    postObj.airAlertsBreakPoint = 4;
                }
            }
            console.log({postObj: postObj});
            return postObj;
        };

        /**
         *
         * @param {object[]} pushList
         * @private
         */
        obj._postPushList = function (pushList) {
            var self = this;
            var postList = [];

            try {
                pushList.forEach(function (pushInfo) {
                    postList.push(self._makePostObj(pushInfo));
                });
            }
            catch(err) {
                console.log(err);
                return;
            }

            if (this.pushData.fcmToken == undefined || this.pushData.fcmToken.length === 0) {
                console.error("You have to register before post");
                console.log(JSON.stringify(postList));
                return;
            }

            $http({
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Accept-Language': Util.language, 'Device-Id': Util.uuid},
                url: self.pushListUrl,
                data: postList,
                timeout: 10*1000
            })
                .success(function (data) {
                    if (data) {
                        console.log(JSON.stringify(data));
                    }
                })
                .error(function (data, status) {
                    console.log(status +":"+data);
                    data = data || "Request failed";
                    var err = new Error(data);
                    err.code = status;
                    console.log(err);
                    //callback(err);
                });
        };

        /**
         *
         * @param {{}} pushInfo
         * @private
         */
        obj._deletePushInfo = function (pushInfo) {
            var self = this;
            var pushObj = {
                type: self.pushData.type,
                cityIndex: pushInfo.cityIndex,
                id: pushInfo.id,
                category: pushInfo.category };
            if (self.pushData.fcmToken) {
                pushObj.fcmToken = self.pushData.fcmToken;
            }
            else if (self.pushData.registrationId) {
                pushObj.registrationId = self.pushData.registrationId;
            }
            else {
                console.error('push info does not have fcmToken or regstrationId');
            }

            $http({
                method: 'DELETE',
                headers: {'Content-Type': 'application/json', 'Device-Id': Util.uuid},
                url: self.pushUrl,
                data: pushObj,
                timeout: 10*1000
            })
                .success(function (data) {
                    if (data) {
                        console.log(JSON.stringify(data));
                    }
                })
                .error(function (data, status) {
                    console.log(status +":"+data);
                    data = data || "Request failed";
                    var err = new Error(data);
                    err.code = status;
                    console.log(err);
                    //callback(err);
                });
        };

        obj._updateFcmToken = function(token) {
            var self = this;
            //update registration id on server
            $http({
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Device-Id': Util.uuid },
                url: self.pushUrl,
                data: { newToken: token, oldToken: self.pushData.fcmToken },
                timeout: 10 * 1000
            })
                .success(function (data) {
                    //callback(undefined, result.data);
                    console.log(data);
                })
                .error(function (data, status) {
                    console.log(status + ":" + data);
                    data = data || "Request failed";
                    var err = new Error(data);
                    err.code = status;
                    console.log(err);
                    //callback(err);
                });
            self.pushData.fcmToken = token;
        };

        /**
         *
         * @param {string} registrationId
         * @private
         */
        obj._updateRegistrationId = function (registrationId) {
            var self = this;
            //update registration id on server
            $http({
                method: 'PUT',
                headers: {'Content-Type': 'application/json', 'Device-Id': Util.uuid},
                url: self.pushUrl,
                data: {newRegId: registrationId, oldRegId: self.pushData.registrationId},
                timeout: 10*1000
            })
                .success(function (data) {
                    //callback(undefined, result.data);
                    console.log(data);
                })
                .error(function (data, status) {
                    console.log(status +":"+data);
                    data = data || "Request failed";
                    var err = new Error(data);
                    err.code = status;
                    console.log(err);
                    //callback(err);
                });
            self.pushData.registrationId = registrationId;
        };

        obj.fcmRegister = function (callback) {
            var self = this;
            if (self.inited === false) {
                Util.ga.trackEvent('push', 'error', 'loadPlugin');
            }

            if (self.pushData.fcmToken == null) {
                Firebase.getToken(function(token) {
                    self.pushData.fcmToken = token;
                });
            }

            /**
             * WeatherInfo 와 circular dependency 제거용.
             * @param {number} cityIndex
             */
            window.updateCityInfo = function (cityIndex) {
                return self.updateCityInfo(cityIndex);
            }
        };

        /**
         *
         * @param {function} callback
         */
        obj.gcmRegister = function (callback) {
            var self = this;

            if (!window.PushNotification) {
                console.log("push notification plugin is not set");
                return;
            }

            window.push = PushNotification.init(self.config);

            window.push.on('registration', function(data) {
                console.log(JSON.stringify({"push-registration":data}));
                if (self.pushData.registrationId != data.registrationId) {
                    self._updateRegistrationId(data.registrationId);
                }

                PushNotification.hasPermission(function(data) {
                    self.isEnabled = data.isEnabled;
                    console.log('Push.isEnabled'+self.isEnabled);
                });

                if (callback) {
                    callback(undefined, data.registrationId);
                }
            });

            //android에서는 background->foreground 넘어올 때 event 발생하지 않음
            window.push.on('notification', function(data) {
                console.log('notification = '+JSON.stringify(data));
                // data.message,
                // data.title,
                // data.count,
                // data.sound,
                // data.image,
                // data.additionalData.foreground
                // data.additionalData.coldstart
                // data.additionalData.cityIndex
                if (data && data.additionalData) {
                    if (data.additionalData.foreground === false) {
                        //clicked 인지 아닌지 구분 필요.
                        //ios의 경우 badge 업데이트
                        //현재위치의 경우 데이타 업데이트 가능? 체크


                        //if have additionalData go to index page
                        var url = '/tab/forecast?fav=' + data.additionalData.cityIndex;
                        //setCityIndex 와 url fav 까지 해야 이동됨 on ios
                        var fav = parseInt(data.additionalData.cityIndex);
                        if (!isNaN(fav)) {
                            if (fav === 0) {
                                var city = WeatherInfo.getCityOfIndex(0);
                                if (city !== null && !city.disable) {
                                    WeatherInfo.setCityIndex(fav);
                                }
                            } else {
                                WeatherInfo.setCityIndex(fav);
                            }
                        }
                        console.log('clicked: ' + data.additionalData.cityIndex + ' url=' + url);
                        $location.url(url);
                        Util.ga.trackEvent('action', 'click', 'push url=' + url);
                    }
                    else if (data.additionalData.foreground === true) {
                        $rootScope.$broadcast('notificationEvent', data);
                        Util.ga.trackEvent('action', 'broadcast', 'notificationEvent');
                    }
                }
                else {
                    Util.ga.trackEvent('action', 'error', 'push data='+JSON.stringify(data));
                }
            });

            window.push.on('error', function(e) {
                console.log('notification error='+e.message);
                Util.ga.trackEvent('plugin', 'error', 'push '+ e.message);
            });

            /**
             * WeatherInfo 와 circular dependency 제거용.
             * @param {number} cityIndex
             */
            window.updateCityInfo = function (cityIndex) {
                return self.updateCityInfo(cityIndex);
            }
        };

        obj.register = function (callback) {
            this.fcmRegister(callback);
        };

        obj.unregister = function () {
            console.log('we do not use unregister');
            //var self = this;
            //console.log('push unregister');
            //window.push.unregister(function() {
            //    console.log('push unregister success');
            //    self.push = undefined;
            //}, function(e) {
            //    console.log('error push unregister');
            //    console.log(e);
            //});

            Firebase.unregister();
        };

        /**
         *
         * @param cityIndex
         * @returns {{name, source, (location|town)}|*}
         * @private
         */
        obj._getSimpleCityInfo = function (cityIndex) {
            var simpleInfo;
            var city = WeatherInfo.getCityOfIndex(cityIndex);
            if (city == undefined) {
                console.log("Fail to find city cityIndex="+cityIndex);
                return;
            }

            simpleInfo = {name: city.name, source: city.source};
            if (city.location) {
                simpleInfo.location = city.location;
            }
            else if (city.address) {
                var town = WeatherUtil.getTownFromFullAddress(WeatherUtil.convertAddressArray(city.address));
                if (town && !(town.first=="" && town.second=="" && town.third=="")) {
                    simpleInfo.town = town;
                }
                else {
                    console.log("Fail to get town info city:"+JSON.stringify((city)));
                    return;
                }
            }
            else {
                console.log("Fail to find location or address city:"+JSON.stringify((city)));
                return;
            }

            return simpleInfo;
        };

        /**
         *
         * @param {number} id
         * @param {number} cityIndex
         * @param {number} startTime
         * @param {number} endTime
         * @returns {{id: number, cityIndex: number, startTime: date, endTime: date, enable: boolean, category: string}}
         */
        obj.newPushAlert = function (id, cityIndex, startTime, endTime) {
            var pushInfo = {
                cityIndex: cityIndex,
                id: id,
                startTime: this.secs2date(startTime*3600),
                endTime: this.secs2date(endTime*3600),
                enable: true,
                category: 'alert'
            };

            var city = this._getSimpleCityInfo(cityIndex);
            if (city == undefined) {
                console.log(new Error("Fail to get city information index: "+cityIndex));
            }
            else {
                for (var key in city) {
                    pushInfo[key] = city[key];
                }
            }

            return pushInfo;
        };

        /**
         *
         * @param {number} id
         * @param {number} cityIndex
         * @param {number} secs
         * @param {boolean[]} dayOfWeek
         * @returns {{id: *, cityIndex: *, time, dayOfWeek: *, enable: boolean, category: string}}
         */
        obj.newPushAlarm = function (id, cityIndex, secs, dayOfWeek) {
            var pushInfo = {
                cityIndex: cityIndex,
                id: id,
                time: this.secs2date(secs),
                dayOfWeek: dayOfWeek,
                enable: true,
                category: 'alarm'
            };

            var city = this._getSimpleCityInfo(cityIndex);
            if (city == undefined) {
                console.log(new Error("Fail to get city information index: "+cityIndex));
            }
            else {
                for (var key in city) {
                    pushInfo[key] = city[key];
                }
            }

            return pushInfo;
        };

        /**
         * update location information
         * @param {number} cityIndex
         */
        obj.updateCityInfo = function (cityIndex) {
            var self = this;
            var pushList = this.pushData.pushList;
            var list = pushList.filter(function (obj) {
               return obj.cityIndex === cityIndex;
            });

            var needToUpdate = false;

            list.forEach(function (pushInfo) {
                var city  = self._getSimpleCityInfo(cityIndex);
                if (city.source == undefined || city.source.length === 0) {
                    return;
                }
                for (var key in city) {
                    if (key == 'location') {
                       if (pushInfo.location.lat === city.location.lat &&
                        pushInfo.location.long === city.location.long)  {
                           needToUpdate = false;
                       }
                       else {
                           needToUpdate = true;
                       }
                    }
                    else if (pushInfo[key] !== city[key]) {
                       needToUpdate = true;
                    }
                    pushInfo[key] = city[key];
                }
            });

            if (needToUpdate) {
                this._postPushList(list);
                this.savePushInfo();
            }
        };

        /**
         *
         * @param {object[]} list
         * @param {number} cityIndex
         */
        obj.updatePushListByCityIndex = function (list, cityIndex) {
            console.log("updatePushListByCityIndex : "+JSON.stringify({list:list, cityIndex:cityIndex}));
            var pushList = this.pushData.pushList;
            var listWithOutCity = pushList.filter(function (obj) {
                return obj.cityIndex !== cityIndex;
            });

            this.pushData.pushList = listWithOutCity.concat(list);

            this._postPushList(list);
            this.savePushInfo();
        };

        /**
         * 도시 삭제 케이스
         * @param {number} cityIndex
         */
        obj.removePushListByCityIndex = function (cityIndex) {
            var self = this;
            var pushList = this.pushData.pushList;
            var removeList = pushList.filter(function (value) {
                return value.cityIndex === cityIndex;
            });
            removeList.forEach(function (obj) {
                self._deletePushInfo(obj);
            });

            //remove object list
            this.pushData.pushList = pushList.filter(function (value) {
                return value.cityIndex !== cityIndex;
            });
            this.savePushInfo();
        };

        obj.getPushListByCityIndex = function (cityIndex) {
            var list = this.pushData.pushList.filter(function (value) {
                return value.cityIndex === cityIndex;
            });
            if (list.length <= 0) {
                console.log('fail to find cityIndex='+cityIndex);
            }
            return list;
        };

        obj.hasPushInfo = function (cityIndex) {
            try {
                var list = this.pushData.pushList.filter(function (value) {
                    return value.cityIndex === cityIndex && value.enable;
                });
                return list.length > 0;
            }
            catch (err) {
                console.error(err);
                return 0;
            }
        };

        /**
         *
         * @param {Date} date
         * @returns {number}
         */
        obj.date2localSecs = function (date) {
            if (date instanceof Date) {
                return date.getHours() * 60 * 60 + date.getMinutes() * 60;
            }
            else {
                console.error("It is not Date date:"+date);
                return 0;
            }
        };

        /**
         *
         * @param {Date} date
         * @returns {number}
         */
        obj.date2utcSecs = function (date) {
            if (date instanceof Date) {
                return date.getUTCHours() * 60 * 60 + date.getUTCMinutes() * 60;
            }
            else {
                console.error("It is not Date date:"+date);
                return 0;
            }
        };

        /**
         *
         * @param secs
         * @returns {Date}
         */
        obj.secs2date = function (secs) {
            var time = new Date();
            time.setHours(0,0,0,0);
            time.setSeconds(secs);
            return time;
        };

        obj.enableAlertForOldAlarm = function (enable) {
            var list = this.pushData.pushList;
            if (enable) {
                list.forEach(function (value) {
                    if (value.category === 'alert') {
                        value.enable = true;
                    }
                });
                this._postPushList(list);
            }
            this.savePushInfo();
        };

        // obj._tokenFreshCallback = function(err, token) {
        //     var self = this;
        //             };

        // obj._notificationCallback = function(err, result) {
        //     console.log(JSON.stringify({ "notification": result }));
        // };

        obj.hasPermission = function(callback) {
            Firebase.hasPermission(callback);
        };

        obj.init = function () {
            var self = this;
            var showAlertInfo = false;

            if (self.loadPushInfo() == null) {
                if (self.loadOldPushInfo()) {
                    //show popup
                    showAlertInfo = true;
                }
            }

            function _tokenFreshCallback(err, token) {
                if (err) {
                    console.error(err);
                    return;
                }
                console.log(JSON.stringify({ "tokenFresh": token }));
                if (self.pushData.fcmToken != token) {
                    self._updateFcmToken(token);
                }
            }

            function _notificationCallback(err, result) {
                console.log(JSON.stringify({ "notification": result }));
                if (result['google.sent_time']) {
                    //background
                    if (result.tap === true) {
                        if (result.cityIndex != undefined) {
                            var url = '/tab/forecast?fav=' + result.cityIndex;
                            //setCityIndex 와 url fav 까지 해야 이동됨 on ios
                            var fav = parseInt(result.cityIndex);
                            if (!isNaN(fav)) {
                                if (fav === 0) {
                                    var city = WeatherInfo.getCityOfIndex(0);
                                    if (city !== null && !city.disable) {
                                        WeatherInfo.setCityIndex(fav);
                                    }
                                } else {
                                    WeatherInfo.setCityIndex(fav);
                                }
                            }
                            console.log('clicked: ' + result.cityIndex + ' url=' + url);
                            $location.url(url);
                            Util.ga.trackEvent('action', 'click', 'push url=' + url);
                        }
                        else {
                            console.log('city index is undefined');
                        }
                    }
                    else {
                        console.log('tap is false');
                    }
                }
                else {
                    //foreground
                    result.message = result.body;
                    $rootScope.$broadcast('notificationEvent', result);
                    Util.ga.trackEvent('action', 'broadcast', 'notificationEvent');
                }
            }

            Firebase.init(_tokenFreshCallback, _notificationCallback);
            if (!Firebase.inited) {
                Util.ga.trackEvent('push', 'error', 'loadPlugin');
                return showAlertInfo;
            }

            self.inited = true;

            // if (!window.PushNotification) {
            //     Util.ga.trackEvent('push', 'error', 'loadPlugin');
            //     return showAlertInfo;
            // }

            if (ionic.Platform.isIOS()) {
                self.pushData.type = 'ios';
            }
            else if (ionic.Platform.isAndroid()) {
                self.pushData.type = 'android';
            }

            // //if push is on, get token
            // if (self.pushData.pushList.length > 0) {
            //     Firebase.hasPermission(function(data) {
            //         self.isEnabled = data.isEnabled;
            //         console.log('Push.isEnabled:'+self.isEnabled);
            //     });

            //     // if (window.push) {
            //     //     console.log('Already set push notification');
            //     //     return showAlertInfo;
            //     // }
            //     // self.register(function (err, registrationId) {
            //     //     console.log('start push registrationId='+registrationId);
            //     // });

            //     Firebase.getToken(function(token) {
            //         self._updateFcmToken(token);
            //     });
            // }

            return showAlertInfo;
        };

        return obj;
    });

