const TRA2THSR_URL = 'https://thsr-tra-time.t112360140.workers.dev/TRA2THSR';
const THSR2TRA_URL = 'https://thsr-tra-time.t112360140.workers.dev/THSR2TRA';
async function get_TRA2THSR(){
    const req = await fetch(TRA2THSR_URL,{
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(TIME_CONFIG.TRA2THSR.WAY),
    });

    if(!req.ok) throw new Error("NetWork Error!");

    return await req.json();
}
async function get_THSR2TRA(){
    const req = await fetch(THSR2TRA_URL,{
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(TIME_CONFIG.THSR2TRA.WAY),
    });

    if(!req.ok) throw new Error("NetWork Error!");

    return await req.json();
}

function parse_time(str){
    const time = str.split(':').map((v)=>(parseInt(v)));
    return time[0]*60+time[1];
}

//----TABLE----
const TRA2THSR_table = document.getElementById('TRA2THSR-table');
const THSR2TRA_table = document.getElementById('THSR2TRA-table');

function data2table(datas, time, first='TRA', second='THSR'){
    let table='';
    datas.forEach((data)=>{
        let classes='', scorll2element;
        const CON_TYE = `${first}2${second}`;
        if(parse_time(data[first].start_time)<=time) classes+='tr-disabled';
        else if(
            (TIME_CONFIG[CON_TYE].depart_early>=0&&parse_time(data[first].start_time)<=time+TIME_CONFIG[CON_TYE].depart_early)||
            (TIME_CONFIG[CON_TYE].depart_early>=0&&parse_time(datas[datas.length-1][first].start_time)<=time+TIME_CONFIG[CON_TYE].depart_early)||
            (TIME_CONFIG[CON_TYE].last_arrival_time>=0&&TIME_CONFIG[CON_TYE].arrive_early>=0&&
                parse_time(data[second].end_time)>=TIME_CONFIG[CON_TYE].last_arrival_time-TIME_CONFIG[CON_TYE].arrive_early)
        ) classes+='tr-extreme';
        else if(
            (TIME_CONFIG[CON_TYE].depart_early>=0&&parse_time(data[first].start_time)-TIME_CONFIG.STEP<=time+TIME_CONFIG[CON_TYE].depart_early)||
            (TIME_CONFIG[CON_TYE].depart_early>=0&&parse_time(datas[datas.length-1][first].start_time)-TIME_CONFIG.STEP<=time+TIME_CONFIG[CON_TYE].depart_early)||
            (TIME_CONFIG[CON_TYE].last_arrival_time>=0&&TIME_CONFIG[CON_TYE].arrive_early>=0&&
                parse_time(data[second].end_time)+TIME_CONFIG.STEP>=TIME_CONFIG[CON_TYE].last_arrival_time-TIME_CONFIG[CON_TYE].arrive_early)
        ) classes+='tr-accep scroll-to';
        else  classes+='tr-ample scroll-to';

        table+=`<tr class="${classes}">
            <td>${data[first].train_number}</td>
            <td>${data[first].start_time} ${data[first].start_station}</td>
            <td>${data[first].end_time} ${data[first].end_station}</td>
            <td>${data[first].spend_time} 分鐘</td>
            <td>${data[second].train_number}</td>
            <td>${data[second].start_time} ${data[second].start_station}</td>
            <td>${data[second].end_time} ${data[second].end_station}</td>
            <td>${data[second].spend_time} 分鐘</td>
            <td>${data.total_spend_time} 分鐘</td>
        </td>`;
    });
    return table;
}

let TRA2THSR_DATA=null,THSR2TRA_DATA=null;
function get_data(){
    TRA2THSR_DATA=null,THSR2TRA_DATA=null;
    get_TRA2THSR().then((D)=>{
        TRA2THSR_DATA=D;
        if(THSR2TRA_DATA!==null) show_data();
    }).catch((e)=>{
        TRA2THSR_DATA=false;
        console.error(e);
        TRA2THSR_table.innerHTML='<tr class="tr-error"><td colspan="9">無法取得時間表</td></tr>';
    });
    get_THSR2TRA().then((D)=>{
        THSR2TRA_DATA=D;
        if(TRA2THSR_DATA!==null) show_data();
    }).catch((e)=>{
        THSR2TRA_DATA=false;
        console.error(e);
        THSR2TRA_table.innerHTML='<tr class="tr-error"><td colspan="9">無法取得時間表</td></tr>';
    });
}

function show_data(){
    const time = parse_time(new Date().toString().slice(16, 21));
    if(TRA2THSR_DATA){
        TRA2THSR_table.innerHTML=data2table(TRA2THSR_DATA, time, 'TRA', 'THSR');
        TRA2THSR_table.getElementsByClassName('scroll-to')[0]?.scrollIntoView({behavior: 'smooth', block: 'center'});
        if(!TRA2THSR_table.getElementsByClassName('scroll-to')[0]) TRA2THSR_table.getElementsByClassName('tr-extreme')[0]?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
    if(THSR2TRA_DATA){
        THSR2TRA_table.innerHTML=data2table(THSR2TRA_DATA, time, 'THSR', 'TRA');
        THSR2TRA_table.getElementsByClassName('scroll-to')[0]?.scrollIntoView({behavior: 'smooth', block: 'center'});
        if(!THSR2TRA_table.getElementsByClassName('scroll-to')[0]) THSR2TRA_table.getElementsByClassName('tr-extreme')[0]?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
}

let GET_DATA_TIMER=0, SHOW_DATA_TIMER=0;
get_data();

//----TIMER----
const timer = document.getElementById('timer');

timer.innerHTML = (`${new Date().getFullYear().toString().padStart(4, '0')}/${(new Date().getMonth()+1).toString().padStart(2, '0')}/${new Date().getDate().toString().padStart(2, '0')}`+' - '+new Date().toString().slice(16, 24));

setInterval(() => {
    timer.innerHTML = (`${new Date().getFullYear().toString().padStart(4, '0')}/${(new Date().getMonth()+1).toString().padStart(2, '0')}/${new Date().getDate().toString().padStart(2, '0')}`+' - '+new Date().toString().slice(16, 24));

    const sec = new Date().getSeconds(), min = new Date().getMinutes();
    if(min%30===0) get_data();
    else if(sec===0) show_data();
}, 1000);

