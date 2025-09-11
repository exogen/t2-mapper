//--------------------------------------------------------------------------
// 
// 
// 
//--------------------------------------------------------------------------

datablock ShapeBaseImageData(MissileBarrelPackImage)
{
   mass = 15;

   className    = TurretPack;

   shapeFile    = "pack_barrel_missile.dts";
   item       = MissileBarrelPack;
   mountPoint = 1;
   offset     = "0 0 0";
	turretBarrel = "MissileBarrelLarge";

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

datablock ItemData(MissileBarrelPack)
{
   className    = Pack;
   catagory     = "Packs";
   shapeFile    = "pack_barrel_missile.dts";
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
   rotate       = true;
   image        = "MissileBarrelPackImage";
	pickUpName = "a missile barrel pack";

   computeCRC = true;

};

//MissileBarrelPackImage.turretBarrel = "MissileBarrelLarge";

function MissileBarrelPackImage::onActivate(%data, %obj, %slot)
{
	checkTurretMount(%data, %obj, %slot);
}

function MissileBarrelPackImage::onDeactivate(%data, %obj, %slot)
{
	%obj.setImageTrigger($BackpackSlot, false);
}

function MissileBarrelPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}