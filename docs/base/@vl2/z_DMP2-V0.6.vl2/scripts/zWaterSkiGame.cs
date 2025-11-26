//water ski support
//Script By: DarkTiger
//Version 1.0
//addWaterSki(); in the console to add water ski triggers to all bodies of water or 
//setupWaterSki(%obj); with %obj being the obj id or name of the body of water you want ot add it too

datablock TriggerData(waterSkiTrig){
   tickPeriodMS =  32;
};

package tdSki{
  function Armor::onTrigger(%data, %player, %triggerNum, %val){
      parent::onTrigger(%data, %player, %triggerNum, %val);
      if(%triggerNum == 2 && isObject(waterSkiGrp)){
         %player.isKeySki = %val;
      }
  }   
};
if(!isActivePackage(tdSki))
   activatePackage(tdSki);

function tdWaterSki(%this,%trigger){
   if(isObject(%this)){
      %vel = %this.getVelocity();
      %xyspeed  = vectorLen(getWords(%vel,0,1) SPC 0);
      %trigZDis = getWord(%this.getPosition(), 2) - getWord(%trigger.getPosition(),2);
      if(!%this.isJetting && %trigZDis < 1){
         if(%xyspeed < 20 || %this.getState() $= "Dead" || %trigZDis < -0.8 || !%this.isKeySki){
            %this.setVelocity(getWords(%vel,0,1) SPC getGravity() * 0.128);
            //error("xyspeed" SPC  %xyspeed SPC "state" SPC %this.getState() SPC "trigDist" SPC %trigZDis SPC "isKeySki" SPC %this.isKeySki);
            %this.waterSki = 0;
         }
         else{
            //error("waterSki");
            %drag  = 1;
            %Upforce  = 0.3;
            %z = %trigZDis < 0.8 ? getWord(%vel,2)+%Upforce : 0;
            %this.setVelocity(getWord(%vel,0) * %drag SPC getWord(%vel,1) * %drag SPC %z);//water drag
            %this.skiEvent = schedule(128, 0, "tdWaterSki", %this, %trigger); 
            %this.waterSki = 1;    
         }
      }
   }
}


function waterSkiTrig::onEnterTrigger(%data, %trigger, %player){
   %drag =  1; //how much we slow down every time we hit the water note its percentage baesd
   %maxSpeed = 15;//how fast we need to be going to be able to skip across the water
   %minZ = -30; // if or downward speed is to much will drag to much and sink  
   //%pingFactor = 0.09;
   %zvel = getWord(%player.getVelocity(),2);
   %xyspeed  = vectorLen(getWords(%player.getVelocity(),0,1) SPC 0);
  // %ping = %player.client.getPing() * %pingFactor;
   //error("water" SPC %zvel SPC %speed SPC %player.wski SPC %ping);
   if(%zvel > %minZ && %xyspeed > %maxSpeed && %zvel < 0){
      %player.setVelocity(getWords(vectorScale(%player.getVelocity(),%drag),0,1) SPC 0);
      if(!%this.waterSki && !isEventPending(%player.skiEvent)){
         %player.jetCount = 0;
         tdWaterSki(%player, %trigger);
      }
   }
}

function waterSkiTrig::onTickTrigger(%this, %triggerId){
 //do nothing
}

function waterSkiTrig::onleaveTrigger(%data, %trigger, %player){
  //do nothing 
}

function addWaterSki(){
   InitContainerRadiusSearch("0 0 50",  9999,  $TypeMasks::WaterObjectType);
   while ((%targetObject = containerSearchNext()) != 0){
      error("adding water ski objs too" SPC %targetObject);
      setupWaterSki(%targetObject);
   }
}


function setupWaterSki(%obj){
   if(!isObject(%obj.skiTrig) && !isObject(%obj.skiZone)){
      if(!isObject(waterSkiGrp)){
         new simGroup(waterSkiGrp);
         MissionGroup.add(waterSkiGrp);
      }
      %waterSurface = getWord(%obj.getWorldBoxCenter(),2) + (getWord(%obj.getScale(),2)/2);
      %trigPos = getWords(%obj.getWorldBoxCenter(),0,1) SPC %waterSurface - 1;
      %trigScale = getWords(%obj.getScale(),0,1) SPC "1";
      %trig = new Trigger() {
         position = %trigPos;
         rotation = "0 0 1 0";
         scale = %trigScale;
         dataBlock = "waterSkiTrig";
         lockCount = "0";
         homingCount = "0";
         polyhedron = "-0.5 0.5 -0.5 1.0 0.0 0.0 -0.0 -1.0 -0.0 -0.0 -0.0 1.0";
      };
      waterSkiGrp.add(%trig);
      %zone = new PhysicalZone() {
         position = vectorAdd(%trigPos,"0 0 0.4");
         rotation = "0 0 1 0";
         scale    = vectorAdd(%trigScale,"0 0 -0.5");
         velocityMod = "1";
         gravityMod = "0";
         appliedForce = "0 0 0";
         polyhedron = "-0.5 0.5 -0.5 1.0 0.0 0.0 -0.0 -1.0 -0.0 -0.0 -0.0 1.0";
         water = 1;
      };
      waterSkiGrp.add(%zone);
      %obj.skiTrig = %trig;
      %obj.skiZone = %zone;
   }
}
