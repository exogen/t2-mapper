//--------------------------------------------------------------------------
// 
// Plasma barrel pack
// 
//--------------------------------------------------------------------------

datablock ShapeBaseImageData(PlasmaBarrelPackImage)
{
   mass = 15;

   shapeFile  = "pack_barrel_fusion.dts";
   item       = PlasmaBarrelPack;
   mountPoint = 1;
   offset     = "0 0 0";
	turretBarrel = "PlasmaBarrelLarge";

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

datablock ItemData(PlasmaBarrelPack)
{
   className    = Pack;
   catagory     = "Packs";
   shapeFile    = "pack_barrel_fusion.dts";
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
   rotate       = true;
   image        = "PlasmaBarrelPackImage";
	pickUpName = "a plasma barrel pack";

   computeCRC = true;

};

function PlasmaBarrelPackImage::onActivate(%data, %obj, %slot)
{
	checkTurretMount(%data, %obj, %slot);
}

function PlasmaBarrelPackImage::onDeactivate(%data, %obj, %slot)
{
	%obj.setImageTrigger($BackpackSlot, false);
}

function PlasmaBarrelPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}