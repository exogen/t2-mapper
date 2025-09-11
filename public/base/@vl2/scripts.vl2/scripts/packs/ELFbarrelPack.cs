//--------------------------------------------------------------------------
// 
// ELF barrel pack
// 
//--------------------------------------------------------------------------

datablock ShapeBaseImageData(ELFBarrelPackImage)
{
   mass = 15;

   shapeFile  = "pack_barrel_elf.dts";
   item       = ELFBarrelPack;
   mountPoint = 1;
   offset     = "0 0 0";
	turretBarrel = "ELFBarrelLarge";

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

datablock ItemData(ELFBarrelPack)
{
   className    = Pack;
   catagory     = "Packs";
   shapeFile    = "pack_barrel_elf.dts";
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
   rotate       = true;
   image        = "ELFBarrelPackImage";
	pickUpName = "an ELF barrel pack";

   computeCRC = true;

};

function ELFBarrelPackImage::onActivate(%data, %obj, %slot)
{
	checkTurretMount(%data, %obj, %slot);
}

function ELFBarrelPackImage::onDeactivate(%data, %obj, %slot)
{
	%obj.setImageTrigger($BackpackSlot, false);
}

function ELFBarrelPack::onPickup(%this, %obj, %shape, %amount)
{
	// created to prevent console errors
}