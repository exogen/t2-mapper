// Red Shifter's Creativity Limiters for Tribes 2
// "With constraints come creativity." -HiRezTodd
// The reverse is also true.  If you limit creativity, you limit constraints.  So here's a bunch of stupid shit.

// Version 0.1.1 contains these Creativity Limiters:
// 1. Creativity Pad (T:V style jump pad)

//-------------------------------
//  EXTENSION 1: CREATIVITY PAD
//-------------------------------
// teamCheck - Only the team that controls the pad can use it
// powerCheck - Power will be required to use the pad
// minSpeed - Minimum horizontal speed that you will have upon using the pad
// maxSpeed - Maximum horizontal speed that you will have upon using the pad (you will not lose speed if you're going over the limit)
// factor - The horizontal multipler you gain upon hitting the pad (default: 1.3)
// jumpPower - The amount of vertical speed applied by the pad (default: 50)
// this isn't clearly ripped from TR2

package jumpPad{
   function Armor::onImpact(%data, %playerObject, %collidedObject, %vec, %vecLen){
      if(%collidedObject.getDataBlock().getName() !$= "CreativityPad"){
         parent::onImpact(%data, %playerObject, %collidedObject, %vec, %vecLen);
      }
   }  
}; 
if(!isActivePackage(jumpPad)) 
   activatePackage(jumpPad); 
   
datablock AudioProfile(CreativityPadSound)
{
	volume = 1.0;
	filename    = "fx/misc/launcher.wav";
	description = AudioClose3d;
	preload = true;
};

datablock StaticShapeData(CreativityPad)
{
	catagory = "Creativity Limiters";
	className = "Creativity Pad";
	isInvincible = true;
	needsNoPower = true;
	alwaysAmbient = true;
	shapeFile = "station_teleport.dts";
	soundEffect = CreativityPadSound;
};

function CreativityPad::onCollision(%this, %obj, %col) {
	// make sure a living player hit the pad
	if( %col.getClassName() !$= "Player" ) return;
	if( %col.getState() $= "Dead" ) return;
	
	// make sure we're the right team, if this a team-based object
	if( %obj.teamCheck == 1 && %obj.team != %col.team ) {
		messageClient(%col.client, 'msgStationDenied', '\c2Access Denied -- Wrong team.~wfx/powered/station_denied.wav');
		return;
	}
	
	// make sure we have power, if this a power-based object
	if( %obj.powerCheck == 1 && !%obj.isPowered() ) {
		messageClient(%col.client, 'msgStationNoPower', '\c2Station is not powered.');
		return;
	}
	
	
	// get player velocity
	%oldVel = %col.getVelocity();
	%x = getWord(%oldVel,0);
	%y = getWord(%oldVel,1);
	%z = getWord(%oldVel,2);
	
	// test change
	//%col.setVelocity(VectorScale(VectorNormalize(%horizonVector), 1000 / 3.6));

	// see if we customized the factor value
	if( %obj.factor !$= "" ) {
		%defaultFactor = %obj.factor;
	}
	else {
		%defaultFactor = 1.3;
	}
	
	// see if we have a maximum horizontal boost
	if( %obj.maxSpeed !$= "" ) {
		%originalSpeed = VectorLen(%x SPC %y SPC "0");
		%newSpeed = %originalSpeed * %defaultFactor;
		%maxSpeed = %obj.maxSpeed / 3.6;
		
		if( %originalSpeed > %maxSpeed ) {
			// don't reduce the player's speed
			%factor = 1.0;
		}
		else if( %newSpeed > %maxSpeed ) {
			// speed up the player to the listed max speed
			%factor = %maxSpeed / %originalSpeed;
		}
		else {
			// apply the maximum boost
			%factor = %defaultFactor;
		}
	}
	else {
		%factor = %defaultFactor;
	}

	// make the changes to player velocity
	%x *= %factor;
	%y *= %factor;
	
	// see if we have a minimum speed off the pad
	%currentSpeed = VectorLen(%x SPC %y SPC "0");
	if( %obj.minSpeed !$= "" && %currentSpeed < %obj.minSpeed / 3.6 ) {
		%newSpeed = VectorScale(VectorNormalize(%x SPC %y SPC "0"), %obj.minSpeed / 3.6);
		%x = getWord(%newSpeed,0);
		%y = getWord(%newSpeed,1);
	}
	
	// add the jump power
	if( %obj.jumpPower !$= "" ) {
		%z = %obj.jumpPower;
	}
	else {
		%z = 50;
	}

	// set the velocity
	%col.setVelocity(%x SPC %y SPC %z);
	
	// play the effects
	%obj.playAudio(0, %this.soundEffect);
	
	if( !%obj.activatedThread ) {
		%obj.activatedThread = 1;
		%obj.playThread($ActivateThread, "Activate");
		%obj.schedule(750, stopThread, $ActivateThread);
		schedule(800, 0, eval, %obj @ ".activatedThread = \"\";");
	}
}

function CreativityPad::losePower(%this, %obj) {
	if( %obj.powerCheck == 1 && %obj.disabledThread == 0 ) {
		%obj.disabledThread = 1;
		%obj.playThread($PowerThread, "DAMAGE");
	}
}
function CreativityPad::gainPower(%this, %obj) {
	if( %obj.powerCheck == 1 && %obj.disabledThread == 1 ) {
		%obj.disabledThread = "";
		%obj.stopThread($PowerThread);
	}
}

// anthem4admin
function CreativityPad::onAdd(%this, %obj) {
	%obj.disabledThread = "";
	%obj.activatedThread = "";
}