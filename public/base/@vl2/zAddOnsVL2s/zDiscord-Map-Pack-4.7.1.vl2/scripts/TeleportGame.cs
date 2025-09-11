//teleport code by sparky
//Reworked by DarkTiger
datablock AudioProfile(TeleporterStart)
{
   filename    = "fx/misc/nexus_cap.wav";
   description = AudioDefault3d;
   preload = true;
};


datablock StaticShapeData(Teleporter)
{
   catagory = "Teleporters";
   shapefile = "nexusbase.dts";
   mass = 10;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   targetNameTag = '';
   targetTypeTag = 'Teleporter';
//----------------------------------
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;

   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   humSound = StationInventoryHumSound;

   cmdCategory = "Support";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";

   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;
//----------------------------------------
};

//datablock Staticshapedata(teledestroyed) : teleporter
//{
   //shapefile = "station_teleport.dts";
//};

$playerreject = 6;
function Teleporter::onDestroyed(%data, %obj, %prevState)
{
   //set the animations
   %obj.playThread(1, "transition");
   %obj.setThreadDir(1, true);
   %obj.setDamageState(Destroyed);
   //%obj.setDatablock(teledestroyed);
   %obj.getDataBlock().onLosePowerDisabled(%obj);
}

//---this is where I create the triggers and put them right over the nexus base's
function teleporter::onEnabled(%data, %obj, %prevState)
{
   %level = %obj.getdamagelevel();
  %obj.setdamagelevel(%level);
   if(%obj.ispowered())
   {
      %obj.playthread(1, "transition");
      %obj.setThreadDir(1, false);
      %obj.playThread(0, "ambient");
      %obj.setThreadDir(0, true);
   }
   else
   {
      %obj.playThread(0, "transition");
      %obj.setThreadDir(0, false);
   }
  Parent::onEnabled(%data, %obj, %prevState);
}

function Teleporter::gainPower(%data, %obj)
{
   %obj.setDatablock(teleporter);
   Parent::gainPower(%data, %obj);
   %obj.playthread(1, "transition");
   %obj.setThreadDir(1, false);
   %obj.playThread(0, "ambient");
   %obj.setThreadDir(0, true);
}

function Teleporter::losePower(%data, %obj)
{
   %obj.playThread(0, "transition");
   %obj.setThreadDir(0, false);
   Parent::losePower(%data, %obj);
}

//---this is where I create the triggers and put them right over the nexus base's
function Teleporter::onAdd(%this, %tp)
{
   Parent::onAdd(%this, %tp);
   if(!isObject(tpSimSet)){
      new simSet(tpSimSet);
      MissionCleanup.add(tpSimSet);
   }
   tpSimSet.add(%tp);
   
   %trigger = new Trigger()
   {
      dataBlock = NewTeleportTrigger;
      polyhedron = "-0.75 0.75 0.1 1.5 0.0 0.0 0.0 -1.5 0.0 0.0 0.0 2.3";
   };
   
   MissionCleanup.add(%trigger);
   if(%tp.noflag $= "")
      %tp.noflag = "0";
   if(%tp.oneway $= "")
      %tp.oneway = "0";
   if(%tp.linkID $= "")
      %tp.linkID = "0";
   if(%tp.linkTo $= "")
      %tp.linkTo = "0";
   %trigger.setTransform(%tp.getTransform());
   
   %trigger.sourcebase = %tp;
   %tp.trigger = %trigger;

 //--------------do we need power?-----------------------
   %tp.playThread(1, "ambient");
   %tp.playThread(0, "transition");
   %tp.playThread(0, "ambient");

   %pos = %trigger.position;
   
   if(%tp.waypoint !$= "")
   {
      %wp = new WayPoint()
      {
         scale = "1 1 1";
         nameTag = %tp.waypoint;
         dataBlock = "WayPointMarker";
         name = %tp.waypoint;
      };
      MissionCleanup.add(%wp);
      %wp.setTransform(%tp.getTransform());
   }

}


datablock TriggerData(NewTeleportTrigger)
{
   tickPeriodMS =  100;
};

//--------------teleporter code here------------------

function NewTeleportTrigger::onEnterTrigger(%data, %trigger, %player)
{
   %colObj = %player;
   %client = %player.client;

   if(%player.transported $= "1")  // if this player was just transported
   {
      %player.transported = "0";
      %colObj.setMoveState(false);
      %trigger.player = %player;
      return; // then get out or it will never stop
   }

//--------------do we have power?-----------------------
   if(%trigger.sourcebase.ispowered() == 0){
      messageClient(%player.client, 'MsgClient', '\c0Teleporter is not powered.~wfx/powered/station_denied.wav');
      return;
   }

//----------------------disabled?-----------------------
   if(%trigger.sourcebase.isDisabled()){
      messageClient(%colObj.client, 'msgStationDisabled', '\c2Teleporter is disabled.~wfx/powered/station_denied.wav');
      return;
   }

//--------------are we on the right team?-----------------------
   if(%player.team != %trigger.sourcebase.team){
      messageClient(%player.client, 'MsgClient', '\c0Wrong team.~wfx/powered/station_denied.wav');
      return;
   }

   //------------are we teleporting?-----------------------
   if(isObject(%trigger.player)){
      messageClient(%player.client, 'MsgClient', '\c0Teleporter in use.~wfx/powered/station_denied.wav');
      return;
   }
   //-------------is this a oneway teleporter?------------------------
   if(%trigger.sourcebase.oneway == "1"){
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1This teleporter is oneway only.~wfx/powered/station_denied.wav');
      return;
   }

   //-------------are we teleporting with flag?----------------------------------------
   %flag = %player.holdingflag;
   if(%player.holdingFlag > 0){
      if(%trigger.sourcebase.noflag $= "1"){
         if(%flag.team == 1)
            %otherTeam = 2;
         else
            %otherTeam = 1;

         game.flagReset(%player.holdingflag);
         messageTeam(%otherTeam, 'MsgCTFFlagReturned', '\c2 %1 tried to teleport with the %2 flag.~wfx/misc/flag_return.wav', %client.name, $teamName[%flag.team], %flag.team);
         messageTeam(%flag.team, 'MsgCTFFlagReturned', '\c2Your flag was returned.~wfx/misc/flag_return.wav', 0, 0, %flag.team);
         messageTeam(0, 'MsgCTFFlagReturned', '\c2The %2 flag was returned to base.~wfx/misc/flag_return.wav', 0, $teamName[%flag.team], %flag.team);
      }
   }
   %destList = getDestTele(%trigger.sourcebase,%player.client);
   
   if(%destList != -1){
      %vc = 0;
      for(%x = 0; %x < getFieldCount(%destList); %x++){
         %targetObj = getField(%destList,%x);
         // make sure its not in use  and its not destroyed  and it has power 
         if(!isObject(%targetObj.trigger.player) && %targetObj.isEnabled() && %targetObj.isPowered())
            %validTarget[%vc++] = %targetObj;
         else
            %inValidTarget[%ivc++] = %targetObj;
         
      }
      if(!%vc){
         if(isObject(%inValidTarget[1].trigger.player))
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter in use.~wfx/powered/station_denied.wav');
         else if(!%inValidTarget[1].isEnabled())
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter is destroyed.~wfx/powered/station_denied.wav');
         else if(!%inValidTarget[1].isPowered())
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter lost power.~wfx/powered/station_denied.wav');
         else
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter in use, destroyed, or loss power.~wfx/powered/station_denied.wav');
      }
      else{
         %dest = %validTarget[getRandom(1,%vc)];
         serverPlay3D(TeleporterStart, %trigger.getTransform());
         messageClient(%player.client, 'MsgClient', '~wfx/misc/nexus_cap.wav');  
         %player.transported = 1;
         %teleDest =  vectorAdd(%dest.getPosition(),"0 0 0.5");
         teleporteffect(vectorAdd(%trigger.sourcebase.getPosition(),"0 0 0.5"));
         teleporteffect(%teleDest);
         %player.setmovestate(true);
         %player.setTransform(vectorAdd(%trigger.sourcebase.getPosition(),"0 0 0.5") SPC getWords(%player.getTransform(),3,6));
         %player.startfade(500,0,true);
         %player.schedule(500, "settransform", %teleDest SPC getWords(%player.getTransform(),3,6));
         %player.schedule(500, "startfade", 500, 0, false);
         %player.schedule(500, "setmovestate", false);
      }
   }
   else
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1This teleporter has no destination.~wfx/misc/warning_beep.wav');   
}
function getDestTele(%obj,%client){
   %idCount = getFieldCount(%obj.linkTo);
   if(!%idCount || %obj.team != %client.team)
      return -1;
   %count = 0;
   for(%i = 0; %i < tpSimSet.getCount(); %i++){
      %dest = tpSimSet.getObject(%i);
      if(%dest.team == %client.team && %dest != %obj){
         for(%a = 0; %a <  getFieldCount(%dest.linkTo); %a++){
            %destID = getField(%dest.linkTo,%a);
            if(%obj.linkID == %destID){// see if it links back to us
               if(%count++ == 1)
                  %teleList = %dest;
               else
                  %teleList = %teleList TAB %dest;
            }
         }
      }
   }
   if(%count > 0){
      return %teleList;
   }
   return -1;
}
function NewTeleportTrigger::onleaveTrigger(%data, %trigger, %player){
   if(%player == %trigger.player){
      %trigger.player = 0;  
   }
   if(!%player.transported){
      %player.tpWarn  = 0;
      %player.tpTime = 0;
      %player.tpDmgTime = 0;
   }
}
function NewTeleportTrigger::onTickTrigger(%data, %trig){
   %player = %trig.player; 
   if(isObject(%player)){
     if(%player.getState() $= "Dead"){
        %player.blowUp();
        %trig.player = 0;
     }
     else{
         if(%player.tpTime > 3000 && !%player.tpWarn){
            messageClient(%player.client, 'MsgLeaveMissionArea', '\c1Move off the teleporter or take damage.~wfx/misc/warning_beep.wav');
            %player.tpWarn = 1;         
         }
         %player.tpTime += %data.tickPeriodMS;
         if(%player.tpTime > 3000){
            %player.tpDmgTime += %data.tickPeriodMS;
            if(%player.tpDmgTime > 1000){
               %player.setdamageflash(0.3);
               %player.damage(0, %player.getPosition(), 0.04, $DamageType::radiation);
            }
         }
     }
   }
   else
      %trig.player = 0;
}

function teleporteffect(%position)
{   %effect1 = new ParticleEmissionDummy()
   {
      position = %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect2 = new ParticleEmissionDummy()
   {
      position = getWord(%position,0) @ " " @ getWord(%position,1) @ " " @ getWord(%position,2) + 0.5;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect3 = new ParticleEmissionDummy()
   {
      position = getWord(%position,0) @ " " @ getWord(%position,1) @ " " @ getWord(%position,2) + 1;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect4 = new ParticleEmissionDummy()
   {
      position = getWord(%position,0) @ " " @ getWord(%position,1) @ " " @ getWord(%position,2) + 1.5;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };
   MissionCleanup.add(%effect1);
   MissionCleanup.add(%effect2);
   MissionCleanup.add(%effect3);
   MissionCleanup.add(%effect4);
   %effect1.schedule(2000, "delete");
   %effect2.schedule(2000, "delete");
   %effect3.schedule(2000, "delete");
   %effect4.schedule(2000, "delete");
}