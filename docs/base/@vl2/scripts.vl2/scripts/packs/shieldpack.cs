// ------------------------------------------------------------------
// SHIELD PACK
// can be used by any armor type
// while activated, absorbs damage at cost of energy

datablock EffectProfile(ShieldPackActivateEffect)
{
   effectname = "packs/shield_on";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(ShieldPackActivateSound)
{
	filename = "fx/packs/shield_on.wav";
	description = ClosestLooping3d;
   preload = true;
   effect = ShieldPackActivateEffect;
};

datablock ShapeBaseImageData(ShieldPackImage)
{
   shapeFile = "pack_upgrade_shield.dts";
   item = ShieldPack;
   mountPoint = 1;
   offset = "0 0 0";

   usesEnergy = true;
   minEnergy = 3;

	stateName[0] = "Idle";
	stateTransitionOnTriggerDown[0] = "Activate";
	
	stateName[1] = "Activate";
	stateScript[1] = "onActivate";
	stateSequence[1] = "fire";
	stateSound[1] = ShieldPackActivateSound;
   stateEnergyDrain[1] = 9;
	stateTransitionOnTriggerUp[1] = "Deactivate";
   stateTransitionOnNoAmmo[1] = "Deactivate";

	stateName[2] = "Deactivate";
	stateScript[2] = "onDeactivate";
	stateTransitionOnTimeout[2] = "Idle";
};

datablock ItemData(ShieldPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "pack_upgrade_shield.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "ShieldPackImage";
	pickUpName = "a shield pack";

   computeCRC = true;
};

function ShieldPackImage::onMount(%data, %obj, %node)
{
}

function ShieldPackImage::onUnmount(%data, %obj, %node)
{
	%obj.setImageTrigger(%node, false);
   %obj.isShielded = "";
}

function ShieldPackImage::onActivate(%data, %obj, %slot)
{
   messageClient(%obj.client, 'MsgShieldPackOn', '\c2Shield pack on.');
   %obj.isShielded = true;
   if ( !isDemo() )
      commandToClient( %obj.client, 'setShieldIconOn' );
}

function ShieldPackImage::onDeactivate(%data, %obj, %slot)
{
   messageClient(%obj.client, 'MsgShieldPackOff', '\c2Shield pack off.');
	%obj.setImageTrigger(%slot,false);
   %obj.isShielded = "";
   if ( !isDemo() )
      commandToClient( %obj.client, 'setShieldIconOff' );
}

function ShieldPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}

