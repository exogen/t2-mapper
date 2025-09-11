// ------------------------------------------------------------------
// ENERGY PACK
// can be used by any armor type
// does not have to be activated
// increases the user's energy recharge rate

datablock ShapeBaseImageData(EnergyPackImage)
{
   shapeFile = "pack_upgrade_energy.dts";
   item = EnergyPack;
   mountPoint = 1;
   offset = "0 0 0";
   rechargeRateBoost = 0.15;

	stateName[0] = "default";
	stateSequence[0] = "activation";
};

datablock ItemData(EnergyPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "pack_upgrade_energy.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "EnergyPackImage";
	pickUpName = "an energy pack";

   computeCRC = true;

};

function EnergyPackImage::onMount(%data, %obj, %node)
{
	%obj.setRechargeRate(%obj.getRechargeRate() + %data.rechargeRateBoost);
   %obj.hasEnergyPack = true; // set for sniper check
}

function EnergyPackImage::onUnmount(%data, %obj, %node)
{
	%obj.setRechargeRate(%obj.getRechargeRate() - %data.rechargeRateBoost);
   %obj.hasEnergyPack = "";
}

function EnergyPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}