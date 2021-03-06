const BigNumber =web3.BigNumber;

const expect = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .expect;

const ZapDB = artifacts.require("Database");
const ZapCoor = artifacts.require("ZapCoordinator");
const Bondage = artifacts.require("Bondage");
const Dispatch = artifacts.require("Dispatch");
const ZapToken = artifacts.require("ZapToken");
const Registry = artifacts.require("Registry");
const Cost = artifacts.require("CurrentCost");

const User = artifacts.require("ExampleUser");
const Oracle = artifacts.require("ExampleOracle");

const nullAddr = "0x0000000000000000000000000000000000000000";

function isEventReceived(logs, eventName) {
    for (let i in logs) {
        let log = logs[i];
        if (log.event === eventName) {
            return true;
        }
    }
    return false;
}



contract("Template",async (accounts)=>{
  let zapdb,zapcoor,token,registry,cost,bondage,dispatch;
    const owner = accounts[0];
    const subscriber = accounts[1];
    const provider = accounts[2];
    const offchainOracle = accounts[3];

    const tokensForOwner = new BigNumber("5000e18");
    const tokensForSubscriber = new BigNumber("3000e18");
    const tokensForProvider = new BigNumber("2000e18");
    const approveTokens = new BigNumber("1000e18");
    const params = ["param1", "param2"]
    let lastblock;
  before(async function deployContract() {

    /***Deploy zap contrracts ***/
    zapdb = await ZapDB.new();
    zapcoor = await ZapCoor.new();
    await zapdb.transferOwnership(zapcoor.address);
    await zapcoor.addImmutableContract('DATABASE', zapdb.address);

    token = await ZapToken.new();
    await zapcoor.addImmutableContract('ZAP_TOKEN', token.address);

    registry = await Registry.new(zapcoor.address);
    await zapcoor.updateContract('REGISTRY', registry.address);

    cost = await Cost.new(zapcoor.address);
    await zapcoor.updateContract('CURRENT_COST', cost.address);

    bondage = await Bondage.new(zapcoor.address);
    await zapcoor.updateContract('BONDAGE', bondage.address);

    dispatch = await Dispatch.new(zapcoor.address);
    await zapcoor.updateContract('DISPATCH', dispatch.address);

    await zapcoor.updateAllDependencies();

    exUser = await User.new(zapcoor.address);
    exOracle = await Oracle.new(zapcoor.address);
  })
  it("1 - Should query an On-Chain Source", async function() {
        token.allocate(owner, tokensForOwner, { from: owner });
        token.allocate(subscriber, tokensForSubscriber, { from: owner });
        
        var useAddr = exUser.address; 
        var oracleAddr = exOracle.address;

        const userEvents = exUser.allEvents({ fromBlock: 0, toBlock: 'latest' });
        userEvents.watch((err, res) => { }); 

        await token.approve(bondage.address, approveTokens, {from: subscriber});
        await bondage.delegateBond(useAddr, oracleAddr, "ExampleEndpoint", 10, {from: subscriber});
        await exUser.testQuery(oracleAddr, "test", "ExampleEndpoint", params);

        let uselogs = await userEvents.get();
        
        await expect(isEventReceived(uselogs, "Results")).to.be.equal(true);
        
        for(let i in uselogs){
            if(uselogs[i].event == "Result1"){
                let result = uselogs[i].args["response1"]                
                await expect(result).to.be.equal("Onchain Answer")
                }
        }
        
        userEvents.stopWatching();


    });
  it("2 - Should query an Off-Chain Source", async function() {
        
        await registry.initiateProvider(
            23456,//Public Key
            "OffchainExample",// Title
            {from: offchainOracle});

        await registry.initiateProviderCurve(
            "ExampleEndpoint",// Endpoint  Name
            [2,2,2,1000], // Bonding Curve:2x+2 from 0-1000
            nullAddr, //No Broker,
            {from: offchainOracle});
        var useAddr = exUser.address; 
        lastblock = web3.eth.blockNumber
        
        
        const userEvents = exUser.allEvents({ fromBlock: lastblock, toBlock: 'latest' });
        userEvents.watch((err, res) => { }); 

        const incomingEvents = dispatch.Incoming({ fromBlock: lastblock, toBlock: 'latest' });
        incomingEvents.watch((err, res) => { }); 

        await token.approve(bondage.address, approveTokens, {from: subscriber});
        await bondage.delegateBond(useAddr, offchainOracle, "ExampleEndpoint", 100, {from: subscriber});
        await exUser.testQuery(offchainOracle, "test", "ExampleEndpoint", params);
        
        let inclogs = await incomingEvents.get();
        for(let i in inclogs){
            if(inclogs[i].args.provider == offchainOracle ){
                await dispatch.respond1(inclogs[i].args["id"], "OffChain Answer", {from: offchainOracle});
              }
        }
        
        let uselogs = await userEvents.get();
        await expect(isEventReceived(uselogs, "Results")).to.be.equal(true);
        for(let i in uselogs){
            if(uselogs[i].event == "Results"){
                let result = uselogs[i].args["response1"]                
                await expect(result).to.be.equal("OffChain Answer")
                }
        }

        userEvents.stopWatching();
        incomingEvents.stopWatching();
    });
})
