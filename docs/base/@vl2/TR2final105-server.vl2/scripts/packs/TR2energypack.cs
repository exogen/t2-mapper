// ------------------------------------------------------------------
// ENERGY PACK
// can be used by any armor type
// does not have to be activated
// increases the user's energy recharge rate

datablock ShapeBaseImageData(TR2EnergyPackImage)
{
   shapeFile = "pack_upgrade_energy.dts";
   item = TR2EnergyPack;
   mountPoint = 1;
   offset = "0 0 0";
   rechargeRateBoost = 0.11;//0.15;

	stateName[0] = "default";
	stateSequence[0] = "activation";
};

datablock ItemData(TR2EnergyPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "pack_upgrade_energy.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "TR2EnergyPackImage";
	pickUpName = "an energy pack";

   computeCRC = false;

};

function TR2EnergyPackImage::onMount(%data, %obj, %node)
{
	%obj.setRechargeRate(%obj.getRechargeRate() + %data.rechargeRateBoost);
   %obj.hasEnergyPack = true; // set for sniper check
}

function TR2EnergyPackImage::onUnmount(%data, %obj, %node)
{
	%obj.setRechargeRate(%obj.getRechargeRate() - %data.rechargeRateBoost);
   %obj.hasEnergyPack = "";
}

// KP:  Tried adding these, but putting state transitions in
//      the above datablock causes a UE.  =(
function TR2EnergyPackImage::onActivate(%data, %obj, %slot)
{
    if (%obj.holdingFlag > 0)
    {
       %obj.flagThrowStrength = 1.5;
       %obj.throwObject(%obj.holdingFlag);
    }
   //messageClient(%obj.client, 'MsgShieldPackOn', '\c2Shield pack on.');
   //%obj.isShielded = true;
   //if ( !isDemo() )
   //   commandToClient( %obj.client, 'setShieldIconOn' );
}

function TR2EnergyPackImage::onDeactivate(%data, %obj, %slot)
{
   //messageClient(%obj.client, 'MsgShieldPackOff', '\c2Shield pack off.');
	//%obj.setImageTrigger(%slot,false);
   //%obj.isShielded = "";
   //if ( !isDemo() )
   //   commandToClient( %obj.client, 'setShieldIconOff' );
}

function TR2EnergyPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}
