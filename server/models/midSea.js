/**
 * Created by kay on 2015-10-23.
 */
/*
var mongoose = require('mongoose');

var midSeaSchema = mongoose.Schema({
    sea: {
        location: String
    },
    regId: String,
    midSeaData: {
        date: String,
        time: String,
        regId: String,
        wf3Am: String,
        wf3Pm: String,
        wf4Am: String,
        wf4Pm: String,
        wf5Am: String,
        wf5Pm: String,
        wf6Am: String,
        wf6Pm: String,
        wf7Am: String,
        wf7Pm: String,
        wf8: String,
        wf9: String,
        wf10: String,
        wh3AAm: {type : Number, default : -100},
        wh3APm: {type : Number, default : -100},
        wh3BAm: {type : Number, default : -100},
        wh3BPm: {type : Number, default : -100},
        wh4AAm: {type : Number, default : -100},
        wh4APm: {type : Number, default : -100},
        wh4BAm: {type : Number, default : -100},
        wh4BPm: {type : Number, default : -100},
        wh5AAm: {type : Number, default : -100},
        wh5APm: {type : Number, default : -100},
        wh5BAm: {type : Number, default : -100},
        wh5BPm: {type : Number, default : -100},
        wh6AAm: {type : Number, default : -100},
        wh6APm: {type : Number, default : -100},
        wh6BAm: {type : Number, default : -100},
        wh6BPm: {type : Number, default : -100},
        wh7AAm: {type : Number, default : -100},
        wh7APm: {type : Number, default : -100},
        wh7BAm: {type : Number, default : -100},
        wh7BPm: {type : Number, default : -100},
        wh8A: {type : Number, default : -100},
        wh8B: {type : Number, default : -100},
        wh9A: {type : Number, default : -100},
        wh9B: {type : Number, default : -100},
        wh10A: {type : Number, default : -100},
        wh10B: {type : Number, default : -100}
    }
});

midSeaSchema.statics = {
    getSeaData: function(first, cb){
        this.find({"sea" : { "first" : location }})
            .sort({"midSeaData.date" : -1, "midSeaData.time" : -1}).limit(1).exec(cb);
    },
    setSeaData: function(seaData, regId, cb){
        var self = this;

        var findQuery = self.findOne({"regId": regId}).exec();

        findQuery.then(function(res){
            if(res == null) return;

            self.update({'regId' : regId, 'midSeaData.date' : seaData.date, 'midSeaData.time' : seaData.time},
                {
                    'regId' : regId,
                    'sea.location': res.sea.location,
                    'midSeaData' : seaData
                },
                {upsert:true}, cb);
        })
    }
};

module.exports = mongoose.model('midSea', midSeaSchema);
*/