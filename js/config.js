const TIME_CONFIG = {
    STEP: 10,
    TRA2THSR: {
        depart_early: 15,
        arrive_early: 20,
        last_arrival_time: 540, // 9*60+0
        WAY: {
            startStation: '1190-北新竹',
            endStation: '1000',
            transferStation: '1194',
        }
    },
    THSR2TRA: {
        depart_early: 30,
        arrive_early: -1,
        last_arrival_time: -1,
        WAY: {
            startStation: '1000',
            endStation: '1190-北新竹',
            transferStation: '1194',
        }
    },
};