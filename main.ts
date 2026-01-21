import type * as AONetworkTypes from "ao-network-revitalized";

//Que pereza formatear la hora loco
let AONetwork = require("ao-network-revitalized");
let convert = require("convert-seconds");
let terminalKit = require("terminal-kit");
let {copy, paste} = require("copy-paste");

const TARGET_FRAME = 20;
const OUT_OF_COMBAT_TIMEOUT = 2;

//Debería de reestructurar todo esto.........

//Como odio commonJS, no me complico, se queda aqui todo tiradoa  lo feo, ya lo reescribiré cuando eso
class CombatPacket{
    private healing:boolean = false;
    private causante:Array<Number> = [];
    private receivedTime:number = 0;
    private amount:number = 0;

    public constructor(causante:Array<Number>, amount:number){
        this.causante = causante;
        this.receivedTime = performance.now();
        this.amount = Math.abs(amount);
        this.healing = (amount<0)?true:false;
    }

    public getTime(){
        return this.receivedTime;
    }

    public getAmount(){
        return this.amount;
    }

    public isHealing(){
        return this.healing;
    }

    public stillInCombat(){
        return ((performance.now()-this.receivedTime)/1000) <= 5;
    }
}

class CombatFragment{
    private timeStart:number = 0;
    private timeEnd:number = 0;
    private packetList:Array<CombatPacket> = [];
    private totalDamage:number = 0;
    private over:boolean = false;

    public constructor(... packets:Array<CombatPacket>){
        packets.sort((a1, a2)=>{
            if(a1.getTime() > a2.getTime()) return 1;
            else return -1;
        });

        for(let i = 0; i < packets.length; i++){
            this.addPacket(packets[i]);
        }

        this.timeStart = performance.now();
    }

    public getTotalDamage(){
        if(!this.over) return 0;
        return this.totalDamage;
    }

    public isOver(){
        return this.over;
    }

    public startingTime(){
        return this.startingTime;
    }

    public addPacket(packet:CombatPacket){
        if(this.over) return false;

        this.totalDamage += packet.getAmount();
        this.packetList.unshift(packet);
    }

    public end(){
        this.timeEnd = performance.now();
        this.over = true;
    }

    public getDPS(){
        if(!this.over)return -1;
        let difference = this.timeEnd - this.timeStart;
        let dps = this.totalDamage/(difference/1000);
        if(dps !== dps) return 0;
        return dps;
        
    }

    public length(){
        return this.packetList.length;
    }

    public getElapsedTime():number{
        if(!this.over) return -1;
        return this.timeEnd-this.timeStart;
    }

    public getLastPacket(){
        return this.packetList[0];
    }
}

class Player{
    id = 0;
    name = "";
    //TODO Hacer esto no?
    mainWeapon = "";
    localplayer = false;
    //Hemos descubierto que los numeritos raros es el GUID del usuario
    guid:Array<number> = [];
    damageFragments:Array<any> = [] ;//CombatFragment

    constructor(id:number,name:string, mainWeapon:string = ""){
        this.name = name;
        this.id = id;
        this.mainWeapon = mainWeapon;
    }

    public addDamagePacket(packet:any){
        let activeFragment:undefined|any = undefined;
        if(this.damageFragments.length == 0 || this.damageFragments[0].isOver()){
            activeFragment = new CombatFragment();
            this.damageFragments.unshift(activeFragment!);
        }
        this.damageFragments[0].addPacket(packet);
    }
    
    public restartDmg(){
        this.damageFragments = [];
    }

    public getDPS():number{
        let totalDps = 0;
        let totalTimeElapsed = 0;
        for(let i = 0; i < this.damageFragments.length; i++){
            let packet:CombatFragment = this.damageFragments[i];
            totalDps += packet.getTotalDamage();
            totalTimeElapsed += packet.getElapsedTime()/1000;
        }
        if(totalTimeElapsed == 0) return 0;
        return totalDps/totalTimeElapsed;
    }

    public getTotalDamage(){
        let total = 0;
        for(let i = 0; i < this.damageFragments.length; i++){
            total += this.damageFragments[i].getTotalDamage();
        }
        return total;
    }
}   

let localPlayer:Player|undefined;
const NETWORK:AONetworkTypes.App = new AONetwork.App(false);

let terminal = terminalKit.terminal;

let referenceTime:number = -1;
let totalFama = 0;
let debug = false;
let playerList:Array<Player> = [];

let block = setInterval(()=>{
    if(referenceTime == -1 && !debug){
        terminal.clear();
        terminal("El mapa aún no se ha establecido");
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
        case "C":
            copyToClipboard();
            break;
    }
});

function reloadEverything(){
    totalFama = 0;
    if(localPlayer){
        localPlayer.restartDmg();
    }
    for(let i = 0; i < playerList.length; i++){
        playerList[i].restartDmg();
    }
    referenceTime = performance.now();
}

function checkForEndedFragments(){
    let ps = [localPlayer];
    ps.push(...playerList);

    for(let i = 0; i < ps.length; i++){
        let p = ps[i];
        if(p == undefined || p.damageFragments.length == 0) continue;
        let fragmento = p.damageFragments[0];
        if(fragmento.isOver())continue;

        if(fragmento.length() == 0){
            if((performance.now()/1000 - fragmento.startingTime()/1000) > OUT_OF_COMBAT_TIMEOUT){
                fragmento.end();
            }
            continue;
        }

        let lastPacket = fragmento.getLastPacket();
        if((performance.now()/1000 - lastPacket.getTime()/1000) > OUT_OF_COMBAT_TIMEOUT){
            fragmento.end();
        }
    }
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

            if(foundP1?.getTotalDamage()! > foundP2?.getTotalDamage()!){
                r = -1;
            }else{
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

    checkForEndedFragments();

    terminal("Pulsa R para reiniciar el DPS meter y las estadisticas\nPulsa C para copiar los datos\nPulsa Q|CTRL+C para salir del programa");
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
    let data = [[localPlayer?.name, formatNumber(localPlayer?.getTotalDamage()), formatNumber(localPlayer?.getDPS())]];
    for(let i = 0; i < playerList.length; i++){
        let player:Player = playerList[i];
        let reglon = [player.name, formatNumber(player.getTotalDamage()), formatNumber(player.getDPS())];
        data.push(reglon);
    }
    return data;
}

function copyToClipboard(){
    let playerData = getPlayerData();

    let resultTest = "Player;Damage;DPS";

    for(let i = 0; i < playerData.length; i++){
        let p = playerData[i];
        let s = `\n${p[0]};${p[1]};${p[2]}`;
        resultTest += s;
    }

    try{
        copy(resultTest);
    }catch(err){}
}

function test(){
    let p1 = new Player(1, "JUAN")
    let p2 = new Player(1, "PEPE")
    let p3 = new Player(1, "ANTONIO")
    let p4 = new Player(1, "GONZALO")

    //playerList.push(p1,p2,p3,p4);
    
    setInterval(()=>{
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
    console.log(parametros);
    let playersInParty = parametros[6];
    let playersPeroNumerosRaros = parametros[5];

    for(let i = 0; i < playersInParty.length; i++){
        let p = playersInParty[i];
        if(findByName(p))continue;
        let nP = playersPeroNumerosRaros[i];

        let player = new Player(-1, p);
        player.guid = nP;
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
    let playerNums = player.guid;
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

    console.log(parametros);

    if(id == -1){
        console.log("Nani");
    }

    let player = new Player(id, name);
    player.guid = guid;

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
    let damage = parametros[2];
    let player = findById(causante);
    if(!player) return;

    let paquete = new CombatPacket(causante, damage);
    player.addDamagePacket(paquete);

    //player.addDamage(damage*-1);
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
        localPlayer.guid = params[1];
    }else{
        localPlayer.id = params[0];
        localPlayer.guid = params[1];
    }

    //for(let i = 0; i < playerList.length; i++){
    //    let p = playerList[i];
    //    p.restartDmg();
    //}
}


//test();