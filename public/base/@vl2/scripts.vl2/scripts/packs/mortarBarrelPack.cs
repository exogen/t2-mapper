//--------------------------------------------------------------------------
// 
// 
// 
//--------------------------------------------------------------------------

datablock ShapeBaseImageData(MortarBarrelPackImage)
{
   mass = 15;

   className    = TurretPack;

   shapeFile  = "pack_barrel_mortar.dts";
   item       = MortarBarrelPack;
   mountPoint = 1;
   offset   = "0 0 0";
	turretBarrel = "MortarBarrelLarge";

	stateName[0] = "Idle";
	stateTransitionOnTriggerDown[0] = "Activate";

	stateName[1] = "Activate";
	stateScript[1] = "onActivate";
	stateTransitionOnTriggerUp[1] = "Deactivate";

	stateName[2] = "Deactivate";
	stateScript[2] = "onDeactivate";
	stateTransitionOnTimeOut[2] = "Idle";

	isLarge = true;
};

datablock ItemData(MortarBarrelPack)
{
   className    = Pack;
   catagory     = "Packs";
   shapeFile    = "pack_barrel_mortar.dts";
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
   rotate       = true;
   image        = "MortarBarrelPackImage";
	pickUpName = "a mortar barrel pack";

   computeCRC = true;

};

function MortarBarrelPackImage::onActivate(%data, %obj, %slot)
{
	checkTurretMount(%data, %obj, %slot);
}

function MortarBarrelPackImage::onDeactivate(%data, %obj, %slot)
{
	%obj.setImageTrigger($BackpackSlot, false);
}

function MortarBarrelPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}