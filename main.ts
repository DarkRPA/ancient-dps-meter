import type { Terminal } from "terminal-kit";
import type * as AONetworkTypes from "ao-network-revitalized";

let AONetwork = require("ao-network-revitalized");
let terminalKit = require("terminal-kit");
//Que pereza formatear la hora loco
let convert = require("convert-seconds");
const TARGET_FRAME = 20;

class Player{
    id = 0;
    name = "";
    totalDamage = 0;
    totalHealing = 0;
    mainWeapon = "";
    localplayer = false;
    numeritosRaros:Array<number> = [];

    constructor(id:number,name:string, mainWeapon:string = ""){
        this.name = name;
        this.id = id;
        this.mainWeapon = mainWeapon;
    }

    public addDamage(dmg:number){
        if(dmg > 0)
            this.totalDamage += dmg;
        else
            this.totalHealing += dmg*-1
    }


    
    public restartDmg(){
        this.totalDamage = 0;
    }

    public getDPS(timeReference:number):number{
        let rightNow = performance.now();
        let diff = (rightNow-referenceTime)/1000;
        return this.totalDamage/diff;
    }
}   

let localPlayer:Player|undefined;
const NETWORK:AONetworkTypes.App = new AONetwork.App(false);

let terminal:Terminal = terminalKit.terminal;

let referenceTime:number = -1;
let totalFama = 0;
let debug = false;
let playerList:Array<Player> = [];

let block = setInterval(()=>{
    if(referenceTime == -1 && !debug){
        terminal.clear();
        terminal("El mapa aún no se ha establecido, cambie de mapa para iniciar el DPS meter\nCada cambio de mapa reseteará el meter");
    }else{
        init();
        clearInterval(block);
    }
}, 500)

NETWORK.on(NETWORK.AODecoder.messageType.Event, route);
NETWORK.on(NETWORK.AODecoder.messageType.OperationRequest, onLocalPlayerUpdate)
NETWORK.on(NETWORK.AODecoder.messageType.OperationResponse, onLocalPlayerUpdate)

function init(){
    terminal.grabInput({mouse:"button"});
    setInterval(()=>{
        draw();
    }, 1000/TARGET_FRAME)
}

const ENCABEZADOS_FAMA = ["Tiempo", "Fama Total", "Fama x Hora"];
const ENCABEZADOS_DPS = ["Nombre", "Daño Total", "DPS"];
const FORMAT = {
        hasBorder: true,
        width: 100,
        wordWrap: true,
        fit: true,
        
    };

terminal.on("key", (name:string, matches:any, data:any)=>{
    switch(name.toUpperCase()){
        case "R":
            reloadEverything();
            break;
        case "CTRL_C":
        case "Q":
            process.exit(0);
            break;
    }
});

function reloadEverything(){
    totalFama = 0;
    if(localPlayer){
        localPlayer.totalDamage = 0;
    }
    for(let i = 0; i < playerList.length; i++){
        playerList[i].totalDamage = 0;
    }
    referenceTime = performance.now();
}

function draw(){
    //Vamos a imprimir la informacion necesaria
    //Limpiamos lo anterior
    terminal.clear();
    let finalFame = [ENCABEZADOS_FAMA, drawFameCells()];
    let finalDps = [ENCABEZADOS_DPS];
    let playerData = getPlayerData();

    terminal.table(finalFame, FORMAT);

    if(playerData.length > 1){
        playerData.sort((p1, p2)=>{
            let foundP1:Player|undefined = findByName(p1[0]);
            let foundP2:Player|undefined = findByName(p2[0]);

            let r = 0;

            if(foundP1?.totalDamage! > foundP2?.totalDamage!){
                r = -1;
            }else if(foundP1?.totalDamage! < foundP2?.totalDamage!){
                r = 1
            }

            return r;
        });
    }
    
    for(let i = 0; i < playerData.length; i++){
        let p = playerData[i];
        finalDps.push(p);
    }

    if(playerData.length <= 0){
        terminal("Aún no hay datos :(");
    }else{
        terminal.table(finalDps, FORMAT);
    }

    terminal("Pulsa R para reiniciar el DPS meter y las estadisticas\nPulsa Q|CTRL+C para salir del programa");
}

function findByName(value:string|number, byName = true):Player|undefined{

    //Devolvemos el usuario local
    if(byName){
        if(localPlayer?.name == value){
            return localPlayer;
        }
    }else{
        if(localPlayer?.id == value){
            return localPlayer;
        }
    }

    for(let i = 0; i < playerList.length; i++){
        if(byName){
            if(playerList[i].name == value){
                return playerList[i];
            }
        }else{
            if(playerList[i].id == value){
                return playerList[i];
            }
        }
    }
}

function findById(id:number){
    return findByName(id, false);
}


function drawFameCells():Array<string>{
    let cells = [];
    let timeNow = performance.now();
    let timeDiff = (timeNow - referenceTime)/1000;

    let formato = convert(timeDiff);
    let hora = "";
    if(formato.hours >= 1){
        hora = `${formato.hours}h ${formato.minutes}m`;
    }else{
        hora = `${formato.minutes}m ${formato.seconds}s`;
    }
    
    cells.push(hora);
    cells.push(formatNumber(totalFama));
    cells.push(formatNumber(Math.floor(getFamePerHour()*100)/100));

    return cells;
}

//Tener que formatear numeros... bof...
function formatNumber(num:number):string{
    let result = "";
    let numCalc = 0;
    if(num >= 10e2 && num < 1*10e5){
        numCalc = Math.round((num/10e2)*100)/100;
        result = `${numCalc}k`;
    }else if(num >= 10e5){
        numCalc = Math.round((num/10e5)*100)/100;
        result = `${numCalc}m`;
    }else{
        result = ""+Math.round((num));
    }

    return result;
}

function getFamePerHour(){
    let momentoActual = performance.now();
    let diff = (momentoActual-referenceTime)/1000;
    let famePerHour = (totalFama/diff)*3600;
    return famePerHour;
}

function getPlayerData(){
    if(localPlayer == undefined) throw new Error("LocalPlayer not initialized");
    let data = [[localPlayer?.name, formatNumber(localPlayer?.totalDamage), formatNumber(localPlayer?.getDPS(referenceTime!))]];
    for(let i = 0; i < playerList.length; i++){
        let player:Player = playerList[i];
        let reglon = [player.name, formatNumber(player.totalDamage), formatNumber(player.getDPS(referenceTime!))];
        data.push(reglon);
    }
    return data;
}

function test(){
    let p1 = new Player(1, "JUAN")
    let p2 = new Player(1, "PEPE")
    let p3 = new Player(1, "ANTONIO")
    let p4 = new Player(1, "GONZALO")

    //playerList.push(p1,p2,p3,p4);
    
    setInterval(()=>{
        p1.addDamage(Math.random()*100);
        p2.addDamage(Math.random()*100);
        p3.addDamage(Math.random()*100);
        p4.addDamage(Math.random()*100);
        totalFama += 1000;
        draw();
    }, 1000)    
}

function route(contexto:any){
    let params = contexto.parameters;
    
    if(contexto.code == 3) return; 
    //console.log(params);
    switch(contexto.parameters["252"]){
        case 229:
            enterToParty(params);
            break;
        case 231:
            //Entra player party
            playerJoinParty(params);
            break;
        case 233:
            //Sale player
            leaveParty(params);
            break;
        case 6:
            //Golpea enemigo
            hitEnemy(params);
            break;
        case 82:
            //Obtenemos fama
            obtainFame(params);
            break;
        case 29:
            //Update ID player
            updatePlayerId(params);
            break;
        
    }
}

function onLocalPlayerUpdate(context:any){
    //console.log(context.parameters);
    if(context.operationCode == 1){
        let params = context.parameters;
        let code = params["253"];
        switch(code){
            case 2:
                onMapChange(params)
                break;
        }
    }
}

function updatePlayerId(parametros:any):void{
    //console.log(parametros);
    let player = findByName(parametros[1]);
    if(!player) return;

    player.id = parametros[0];
}

function enterToParty(parametros:any):void{
    let playersInParty = parametros[5];
    let playersPeroNumerosRaros = parametros[4];

    for(let i = 0; i < playersInParty.length; i++){
        let p = playersInParty[i];
        if(findByName(p))continue;
        let nP = playersPeroNumerosRaros[i];

        let player = new Player(-1, p);
        player.numeritosRaros = nP;
        playerList.push(player);
    }

}

function findByNumerosRaros(numeros:Array<number>){
    if(checkNumbers(localPlayer!, numeros)){
        return localPlayer;
    }

    for(let i = 0; i < playerList.length; i++){
        let playerNums = playerList[i];
        
        if(checkNumbers(playerNums, numeros)){
            return playerNums;
        }
    }
    return undefined;
}

function checkNumbers(player:Player, numeros:Array<number>){
    if(!player) return false;
    let playerNums = player.numeritosRaros;
    let found = true
    for(let x = 0; x < playerNums.length; x++){
        if(numeros[x] != playerNums[x]) {
            found = false
            break;
        }
    }
    return found;
}

function getIndexFromName(name:string):number{
    for(let i = 0; i < playerList.length; i++){
        let p = playerList[i];
        if(p.name == name) return i;
    }

    return -1;
}

function playerJoinParty(parametros:any):void{
    let name = parametros[2];
    let guid = parametros[1];
    let id = parametros[0];

    let player = new Player(id, name);
    player.numeritosRaros = guid;

    playerList.push(player);
}

function leaveParty(parametros:any):void{
    let numRaros = parametros["1"];
    let p = findByNumerosRaros(numRaros);

    if(p == undefined) return;
    if(p.localplayer){
        playerList = [];
    }else{
        let indexP = getIndexFromName(p.name);
        playerList.splice(indexP, 1);
    }
}

function hitEnemy(parametros:any):void{
    let causante = parametros[6];
    let victima = parametros[0];

    let damage = parametros[2];

    let player = findById(causante);
    if(!player) return;

    player.addDamage(damage*-1);
}

function obtainFame(parametros:any):void{
    let cantBase = parametros[2]/10000;
    let premium = parametros[5];

    let calcPremium = (premium)?cantBase*1.5:cantBase;

    totalFama += calcPremium;
}

function onMapChange(params:any){
    if(referenceTime == -1)
        referenceTime = performance.now();

    if(localPlayer == undefined){
        localPlayer = new Player(params[0], params[2]);
        localPlayer.localplayer = true;
        localPlayer.numeritosRaros = params[1];
    }else{
        localPlayer.id = params[0];
        localPlayer.numeritosRaros = params[1];
    }

    //for(let i = 0; i < playerList.length; i++){
    //    let p = playerList[i];
    //    p.restartDmg();
    //}
}


//test();