//--------------------------------------------------------------------------
function GameConnection::sensorPing(%this, %ping)
{
   sensorHud.ping = %ping;
   sensorHud.update();
}

function GameConnection::sensorJammed(%this, %jam)
{
   sensorHud.jam = %jam;
   sensorHud.update();
}

function SensorHud::update(%this)
{
   if(!%this.ping && !%this.jam)
   {
      %this.setVisible(false);
      sensorHudBack.setVisible(true);
      return;
   }
   
   %this.setVisible(true);
   sensorHudBack.setVisible(false);
      
   if(%this.jam)
      %this.color = %this.jamColor;
   else
      %this.color = %this.pingColor;
}

// - anything which should be reset on new server/mission
function clientCmdResetHud()
{
   deploySensor.setVisible(false);
   controlObjectText.setVisible(false);

   sensorHud.jam = false;
   sensorHud.ping = false;
   sensorHud.update();
}

//--------------------------------------------------------------------------
$vehicleReticle[AssaultVehicle, 1, bitmap] = "gui/hud_ret_tankchaingun";
$vehicleReticle[AssaultVehicle, 1, frame] = true;
$vehicleReticle[AssaultVehicle, 2, bitmap] = "gui/hud_ret_tankmortar";
$vehicleReticle[AssaultVehicle, 2, frame] = true;

$vehicleReticle[BomberFlyer, 1, bitmap] = "gui/hud_ret_shrike";
$vehicleReticle[BomberFlyer, 1, frame] = false;
$vehicleReticle[BomberFlyer, 2, bitmap] = "";
$vehicleReticle[BomberFlyer, 2, frame] = false;
$vehicleReticle[BomberFlyer, 3, bitmap] = "gui/hud_ret_targlaser";
$vehicleReticle[BomberFlyer, 3, frame] = false;

function GameConnection::setVWeaponsHudActive(%client, %slot)
{
   %veh = %client.player.getObjectMount();
   %vehType = %veh.getDatablock().getName();
   commandToClient(%client, 'setVWeaponsHudActive', %slot, %vehType);
}

function clientCmdSetVWeaponsHudActive(%num, %vType)
{
   //vWeaponsBox.setActiveWeapon(%num);
   if(%num > $numVWeapons)
      %num = $numVWeapons;

   for(%i = 1; %i <= $numVWeapons; %i++)
   {
      %oldHilite = "vWeap" @ %i @ "Hilite";
      %oldHilite.setVisible(false);
   }
   %newHilite = "vWeap" @ %num @ "Hilite";
   %newHilite.setVisible(true);

   // set the bitmap and frame for the reticle
   reticleHud.setBitmap($vehicleReticle[%vType, %num, bitmap]);
   reticleFrameHud.setVisible($vehicleReticle[%vType, %num, frame]);
}

function GameConnection::setVWeaponsHudClearAll(%client)
{
   commandToClient(%client, 'setVWeaponsHudClearAll');
}

function clientCmdSetVWeaponsHudClearAll()
{
   //vWeaponsBox.clearAll();
}

//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudBitmap(%client, %slot, %name, %bitmap)
{
   commandToClient(%client, 'setWeaponsHudBitmap',%slot,%name,%bitmap);
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudBitmap(%slot, %name, %bitmap)
{
   $WeaponNames[%slot] = %name;
   weaponsHud.setWeaponBitmap(%slot,%bitmap);
}

//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudItem(%client, %name, %ammoAmount, %addItem)
{
   //error("GC:SWHI name="@%name@",ammoAmount="@%ammoAmount@",addItem="@%addItem);
//    for(%i = 0; %i < $WeaponsHudCount; %i++)
//       if($WeaponsHudData[%i, itemDataName] $= %name)
//       {
//          if($WeaponsHudData[%i, ammoDataName] !$= "") {
//             %ammoInv = %client.player.inv[$WeaponsHudData[%i, ammoDataName]];
//             //error("  ----- player has " @ %ammoInv SPC $WeaponsHudData[%i, ammoDataName]);
//             //error("SWHI:Setting weapon "@%name@" ("@%i@") ammo to " @ %ammoInv);
//             commandToClient(%client, 'setWeaponsHudItem',%i,%ammoInv, %addItem);
//          }
//          else {
//             //error("SWHI:Setting weapon "@%name@" ("@%i@") ammo to infinite");
//             commandToClient(%client, 'setWeaponsHudItem',%i,-1, %addItem);
//          }
//          break;
//       }


   // My try...
   for(%i = 0; %i < $WeaponsHudCount; %i++)
      if($WeaponsHudData[%i, itemDataName] $= %name)
      {
         if($WeaponsHudData[%i, ammoDataName] !$= "") {
            %ammoInv = %client.player.inv[$WeaponsHudData[%i, ammoDataName]];
            //error("  ----- player has " @ %ammoInv SPC $WeaponsHudData[%i, ammoDataName]);
            //error("SWHI:Setting weapon "@%name@" ("@%i@") ammo to " @ %ammoInv);
            commandToClient(%client, 'setWeaponsHudItem',%i,%ammoInv, %addItem);
         }
         else {
            //error("SWHI:Setting weapon "@%name@" ("@%i@") ammo to infinite");
            commandToClient(%client, 'setWeaponsHudItem',%i,-1, %addItem);
         }
         break;
      }
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudItem(%slot, %ammoAmount, %addItem)
{
   if(%addItem) {
      //error("adding weapon to hud in slot " @ %slot @ " with ammo " @ %ammoAmount);
      weaponsHud.addWeapon(%slot, %ammoAmount);
   }
   else {
      //error("removing weapon from hud");
      weaponsHud.removeWeapon(%slot);
   }
}

//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudAmmo(%client, %name, %ammoAmount)
{
   for(%i = 0; %i < $WeaponsHudCount; %i++)
      if($WeaponsHudData[%i, ammoDataName] $= %name)
      {
         //error("SWHA:Setting ammo "@%name@" for weapon "@%i@" to " @ %ammoAmount);
         commandToClient(%client, 'setWeaponsHudAmmo',%i, %ammoAmount);
         break;
      }
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudAmmo(%slot, %ammoAmount)
{
   weaponsHud.setAmmo(%slot, %ammoAmount);
}

//----------------------------------------------------------------------------
// z0dd - ZOD, 9/13/02. Serverside reticles, sever tells client what file to use.
function GameConnection::setWeaponsHudActive(%client, %name, %clearActive)
{
   if(%clearActive)
   {
      commandToClient(%client, 'setWeaponsHudActive', -1);
   }
   else
   {
      for(%i = 0; %i < $WeaponsHudCount; %i++)
      {
         if($WeaponsHudData[%i, itemDataName] $= %name)
         {
            commandToClient(%client, 'setWeaponsHudActive', %i, $WeaponsHudData[%i, reticle], $WeaponsHudData[%i, visible]);
            break;
         }
      }
   }
}

//----------------------------------------------------------------------------
// z0dd- ZOD, 9/13/02. Serverside reticles, sever tells client what file to use.
function clientCmdSetWeaponsHudActive(%slot, %ret, %vis)
{
   // z0dd - ZOD, 9/30/02. Changed for lazy scripter backward compatibility.
   weaponsHud.setActiveWeapon(%slot);
   switch$($WeaponNames[%slot])
   {
      case "Blaster":
         reticleHud.setBitmap("gui/ret_blaster");
         reticleFrameHud.setVisible(true);
      case "Plasma":
         reticleHud.setBitmap("gui/ret_plasma");
         reticleFrameHud.setVisible(true);
      case "Chaingun":
         reticleHud.setBitmap("gui/ret_chaingun");
         reticleFrameHud.setVisible(true);
      case "Disc":  
         reticleHud.setBitmap("gui/ret_disc");
         reticleFrameHud.setVisible(true);
      case "GrenadeLauncher":
         reticleHud.setBitmap("gui/ret_grenade");
         reticleFrameHud.setVisible(true);
      case "SniperRifle":
         reticleHud.setBitmap("gui/hud_ret_sniper");
         reticleFrameHud.setVisible(false);
      case "ELFGun":
         reticleHud.setBitmap("gui/ret_elf");
         reticleFrameHud.setVisible(true);
      case "Mortar":
         reticleHud.setBitmap("gui/ret_mortor");
         reticleFrameHud.setVisible(true);
      case "MissileLauncher":
         reticleHud.setBitmap("gui/ret_missile");
         reticleFrameHud.setVisible(true);
      case "ShockLance":
         reticleHud.setBitmap("gui/hud_ret_shocklance");
         reticleFrameHud.setVisible(false);
      case "TargetingLaser":
         reticleHud.setBitmap("gui/hud_ret_targlaser");
         reticleFrameHud.setVisible(false);
      case "TR2Disc":
         reticleHud.setBitmap("gui/ret_disc");
         reticleFrameHud.setVisible(true);
      case "TR2GrenadeLauncher":
         reticleHud.setBitmap("gui/ret_grenade");
         reticleFrameHud.setVisible(true);
      case "TR2Chaingun":
         reticleHud.setBitmap("gui/ret_chaingun");
         reticleFrameHud.setVisible(true);
      case "TR2Mortar":
         reticleHud.setBitmap("gui/ret_mortor");
         reticleFrameHud.setVisible(true);
      case "TR2Shocklance":
         reticleHud.setBitmap("gui/hud_ret_shocklance");
         reticleFrameHud.setVisible(false);
      case "TR2GoldTargetingLaser":
         reticleHud.setBitmap("gui/hud_ret_targlaser");
         reticleFrameHud.setVisible(false);
      case "TR2SilverTargetingLaser":
         reticleHud.setBitmap("gui/hud_ret_targlaser");
         reticleFrameHud.setVisible(false);
      default:
         reticleHud.setBitmap(%ret);
         reticleFrameHud.setVisible(%vis);
   }
}

function clientCmdSetRepairReticle()
{
   reticleHud.setBitmap("gui/ret_chaingun");
   reticleFrameHud.setVisible(true);
}

//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudBackGroundBmp(%client, %name)
{
   commandToClient(%client, 'setWeaponsHudBackGroundBmp',%name);
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudBackGroundBmp(%name)
{
   weaponsHud.setBackGroundBitmap(%name);
}

//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudHighLightBmp(%client, %name)
{
   commandToClient(%client, 'setWeaponsHudHighLightBmp',%name);
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudHighLightBmp(%name)
{
   weaponsHud.setHighLightBitmap(%name);
}

//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudInfiniteAmmoBmp(%client, %name)
{
   commandToClient(%client, 'setWeaponsHudInfiniteAmmoBmp',%name);
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudInfiniteAmmoBmp(%name)
{
   weaponsHud.setInfiniteAmmoBitmap(%name);
}
//----------------------------------------------------------------------------
function GameConnection::setWeaponsHudClearAll(%client)
{
   commandToClient(%client, 'setWeaponsHudClearAll');
}

//----------------------------------------------------------------------------
function clientCmdSetWeaponsHudClearAll()
{
   weaponsHud.clearAll();
}

//----------------------------------------------------------------------------
//   Ammo Hud
//----------------------------------------------------------------------------
function GameConnection::setAmmoHudCount(%client, %amount)
{
   commandToClient(%client, 'setAmmoHudCount', %amount);
}

//----------------------------------------------------------------------------
function clientCmdSetAmmoHudCount(%amount)
{
   if(%amount == -1)
      ammoHud.setValue("");
   else
      ammoHud.setValue(%amount);
}

//----------------------------------------------------------------------------
//   Backpack Hud
//----------------------------------------------------------------------------

$BackpackHudData[0, itemDataName] = "AmmoPack";
$BackpackHudData[0, bitmapName] = "gui/hud_new_packammo";
$BackpackHudData[1, itemDataName] = "CloakingPack";
$BackpackHudData[1, bitmapName] = "gui/hud_new_packcloak";
$BackpackHudData[2, itemDataName] = "EnergyPack";
$BackpackHudData[2, bitmapName] = "gui/hud_new_packenergy";
$BackpackHudData[3, itemDataName] = "RepairPack";
$BackpackHudData[3, bitmapName] = "gui/hud_new_packrepair";
$BackpackHudData[4, itemDataName] = "SatchelCharge";
$BackpackHudData[4, bitmapName] = "gui/hud_new_packsatchel";
$BackpackHudData[5, itemDataName] = "ShieldPack";
$BackpackHudData[5, bitmapName] = "gui/hud_new_packshield";
$BackpackHudData[6, itemDataName] = "InventoryDeployable";
$BackpackHudData[6, bitmapName] = "gui/hud_new_packinventory";
$BackpackHudData[7, itemDataName] = "MotionSensorDeployable";
$BackpackHudData[7, bitmapName] = "gui/hud_new_packmotionsens";
$BackpackHudData[8, itemDataName] = "PulseSensorDeployable";
$BackpackHudData[8, bitmapName] = "gui/hud_new_packradar";
$BackpackHudData[9, itemDataName] = "TurretOutdoorDeployable";
$BackpackHudData[9, bitmapName] = "gui/hud_new_packturretout";
$BackpackHudData[10, itemDataName] = "TurretIndoorDeployable";
$BackpackHudData[10, bitmapName] = "gui/hud_new_packturretin";
$BackpackHudData[11, itemDataName] = "SensorJammerPack";
$BackpackHudData[11, bitmapName] = "gui/hud_new_packsensjam";
$BackpackHudData[12, itemDataName] = "AABarrelPack";
$BackpackHudData[12, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[13, itemDataName] = "FusionBarrelPack";
$BackpackHudData[13, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[14, itemDataName] = "MissileBarrelPack";
$BackpackHudData[14, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[15, itemDataName] = "PlasmaBarrelPack";
$BackpackHudData[15, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[16, itemDataName] = "ELFBarrelPack";
$BackpackHudData[16, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[17, itemDataName] = "MortarBarrelPack";
$BackpackHudData[17, bitmapName] = "gui/hud_new_packturret";
$BackpackHudData[18, itemDataName] = "SatchelUnarmed";
$BackpackHudData[18, bitmapName] = "gui/hud_satchel_unarmed";

// TR2
$BackpackHudData[19, itemDataName] = "TR2EnergyPack";
$BackpackHudData[19, bitmapName] = "gui/hud_new_packenergy";

$BackpackHudCount = 20;

function GameConnection::clearBackpackIcon(%client)
{
   commandToClient(%client, 'setBackpackHudItem', 0, 0);
}

function GameConnection::setBackpackHudItem(%client, %name, %addItem)
{
   for(%i = 0; %i < $BackpackHudCount; %i++)
      if($BackpackHudData[%i, itemDataName] $= %name)
         commandToClient(%client, 'setBackpackHudItem', %i, %addItem);
}

function clientCmdSetBackpackHudItem(%num, %addItem)
{
   if(%addItem)
   {
      backpackIcon.setBitmap($BackpackHudData[%num, bitmapName]);
      backpackFrame.setVisible(true);
      backpackIcon.setVisible(true);
      backpackFrame.pack = true;
   }
   else
   {
      backpackIcon.setBitmap("");
      backpackFrame.setVisible(false);
      backpackText.setValue("");
      backpackText.setVisible(false);
      backpackFrame.pack = false;
   }
}

function GameConnection::updateSensorPackText(%client, %num)
{
   commandToClient(%client, 'updatePackText', %num);
}

function clientCmdUpdatePackText(%num)
{
   backpackText.setValue(%num);
   if(%num == 0)
      backpackText.setVisible(false);
   else
      backpackText.setVisible(true);
}

// Pack Icons Activate / Deactivate
function clientCmdSetSatchelArmed()
{
   backpackIcon.setBitmap( "gui/hud_satchel_armed" );
}

function clientCmdsetCloakIconOn()
{
   backpackIcon.setBitmap( "gui/hud_new_packcloak_armed" );
}

function clientCmdsetCloakIconOff()
{
   backpackIcon.setBitmap( "gui/hud_new_packcloak" );
}

function clientCmdsetRepairPackIconOn()
{
   backpackIcon.setBitmap( "gui/hud_new_packrepair_armed" );
}

function clientCmdsetRepairPackIconOff()
{
   backpackIcon.setBitmap( "gui/hud_new_packrepair" );
}

function clientCmdsetShieldIconOn()
{
   backpackIcon.setBitmap( "gui/hud_new_packshield_armed" );
}

function clientCmdsetShieldIconOff()
{
   backpackIcon.setBitmap( "gui/hud_new_packshield" );
}

function clientCmdsetSenJamIconOn()
{
   backpackIcon.setBitmap( "gui/hud_new_packsensjam_armed" );
}

function clientCmdsetSenJamIconOff()
{
   backpackIcon.setBitmap( "gui/hud_new_packsensjam" );
}


//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
$InventoryHudData[0, bitmapName]   = "gui/hud_handgren";
$InventoryHudData[0, itemDataName] = Grenade;
$InventoryHudData[0, ammoDataName] = Grenade;
$InventoryHudData[0, slot]         = 0;
$InventoryHudData[1, bitmapName]   = "gui/hud_mine";
$InventoryHudData[1, itemDataName] = Mine;
$InventoryHudData[1, ammoDataName] = Mine;
$InventoryHudData[1, slot]         = 1;
$InventoryHudData[2, bitmapName]   = "gui/hud_medpack";
$InventoryHudData[2, itemDataName] = RepairKit;
$InventoryHudData[2, ammoDataName] = RepairKit;
$InventoryHudData[2, slot]         = 3;
$InventoryHudData[3, bitmapName]   = "gui/hud_whiteout_gren";
$InventoryHudData[3, itemDataName] = FlashGrenade;
$InventoryHudData[3, ammoDataName] = FlashGrenade;
$InventoryHudData[3, slot]         = 0;
$InventoryHudData[4, bitmapName]   = "gui/hud_concuss_gren";
$InventoryHudData[4, itemDataName] = ConcussionGrenade;
$InventoryHudData[4, ammoDataName] = ConcussionGrenade;
$InventoryHudData[4, slot]         = 0;
$InventoryHudData[5, bitmapName]   = "gui/hud_handgren";
$InventoryHudData[5, itemDataName] = FlareGrenade;
$InventoryHudData[5, ammoDataName] = FlareGrenade;
$InventoryHudData[5, slot]         = 0;
$InventoryHudData[6, bitmapName]   = "gui/hud_handgren";
$InventoryHudData[6, itemDataName] = CameraGrenade;
$InventoryHudData[6, ammoDataName] = CameraGrenade;
$InventoryHudData[6, slot]         = 0;
$InventoryHudData[7, bitmapName]   = "gui/hud_beacon";
$InventoryHudData[7, itemDataName] = Beacon;
$InventoryHudData[7, ammoDataName] = Beacon;
$InventoryHudData[7, slot]         = 2;

// TR2
$InventoryHudData[8, bitmapName]   = "gui/hud_handgren";
$InventoryHudData[8, itemDataName] = TR2Grenade;
$InventoryHudData[8, ammoDataName] = TR2Grenade;
$InventoryHudData[8, slot]         = 0;

$InventoryHudCount = 9;


//----------------------------------------------------------------------------
//   Inventory Hud
//----------------------------------------------------------------------------
//-------------------------------------------------------------------------   ---
function GameConnection::setInventoryHudBitmap(%client, %slot, %name, %bitmap)
{
   commandToClient(%client, 'setInventoryHudBitmap',%slot,%name,%bitmap);
}

//----------------------------------------------------------------------------
function clientCmdSetInventoryHudBitmap(%slot, %name, %bitmap)
{
   inventoryHud.setInventoryBitmap(%slot,%bitmap);
}

//----------------------------------------------------------------------------
function GameConnection::setInventoryHudItem(%client, %name, %amount, %addItem)
{
   for(%i = 0; %i < $InventoryHudCount; %i++)
      if($InventoryHudData[%i, itemDataName] $= %name)
      {
         if($InventoryHudData[%i, ammoDataName] !$= "")
            commandToClient(%client, 'setInventoryHudItem',$InventoryHudData[%i, slot],%amount, %addItem);
         else
            commandToClient(%client, 'setInventoryHudItem',$InventoryHudData[%i, slot],-1, %addItem);
         break;   
      }
}

//----------------------------------------------------------------------------
function clientCmdSetInventoryHudItem(%slot, %amount, %addItem)
{
   if(%addItem)
      inventoryHud.addInventory(%slot, %amount);
   else
      inventoryHud.removeInventory(%slot);
}

//----------------------------------------------------------------------------
function GameConnection::setInventoryHudAmount(%client, %name, %amount)
{
   for(%i = 0; %i < $InventoryHudCount; %i++)
      if($InventoryHudData[%i, ammoDataName] $= %name)
      {
         commandToClient(%client, 'setInventoryHudAmount',$InventoryHudData[%i, slot], %amount);
         break;
      }
}

//----------------------------------------------------------------------------
function clientCmdSetInventoryHudAmount(%slot, %amount)
{
   inventoryHud.setAmount(%slot, %amount);
}

//----------------------------------------------------------------------------
function GameConnection::setInventoryHudBackGroundBmp(%client, %name)
{
   commandToClient(%client, 'setInventoryHudBackGroundBmp',%name);
}

//----------------------------------------------------------------------------
function clientCmdSetInventoryHudBackGroundBmp(%name)
{
   inventoryHud.setBackGroundBitmap(%name);
}

//----------------------------------------------------------------------------
function GameConnection::setInventoryHudClearAll(%client)
{
   commandToClient(%client, 'setInventoryHudClearAll');
}

//----------------------------------------------------------------------------
function clientCmdSetInventoryHudClearAll()
{
   inventoryHud.clearAll();
   backpackIcon.setBitmap( "" );
   backpackFrame.setVisible( false );
   backpackText.setValue( "" );
   backpackText.setVisible(false);
   backpackFrame.pack = false;
}

//----------------------------------------------------------------------------
// MessageHud
function MessageHud::open(%this)
{
   %offset = 6;

   if(%this.isVisible())
      return;

   if(%this.isTeamMsg)
      %text = "TEAM:";
   else
      %text = "GLOBAL:";

   MessageHud_Text.setValue(%text);
   
   %windowPos = "8 " @ ( getWord( outerChatHud.position, 1 ) + getWord( outerChatHud.extent, 1 ) + 1 );
   %windowExt = getWord( OuterChatHud.extent, 0 ) @ " " @ getWord( MessageHud_Frame.extent, 1 );
   
   if( MainVoteHud.isVisible() )
   {
      %votePos = firstWord( MainVoteHud.position ) @ " " @ ( getWord( OuterChatHud.extent, 1 ) + getWord( messageHud_Frame.extent, 1 ) + 10 );    
      MainVoteHud.position = %votePos;
   }

	if( voiceCommHud.isVisible() )
	{
		%vCommPos = firstWord( voiceCommHud.position ) SPC ( getWord( OuterChatHud.extent, 1 ) + getWord( messageHud_Frame.extent, 1 ) + 18 );
		voiceCommHud.position = %vCommPos;
	}
   
   %textExtent = getWord(MessageHud_Text.extent, 0);
   %ctrlExtent = getWord(MessageHud_Frame.extent, 0);

   Canvas.pushDialog(%this);
   
   messageHud_Frame.position = %windowPos;
   messageHud_Frame.extent = %windowExt;
   MessageHud_Edit.position = setWord(MessageHud_Edit.position, 0, %textExtent + %offset);
   MessageHud_Edit.extent = setWord(MessageHud_Edit.extent, 0, %ctrlExtent - %textExtent - (2 * %offset));

   %this.setVisible(true);
   deactivateKeyboard();
   MessageHud_Edit.makeFirstResponder(true);
}

//------------------------------------------------------------------------------
function MessageHud::close(%this)
{
   if(!%this.isVisible())
      return;
      
   // readjust vote hud if open
   if( MainVoteHud.isVisible() )
   {
      %tempY = getWord(outerChatHud.position, 1) + getWord(outerChatHud.extent, 1) + 2;
      %mainVoteX = firstWord(mainVoteHud.position);
      %voteHudPos = %mainVoteX SPC %tempY;
      mainVoteHud.position = %voteHudPos;
   }
	// put voice comm hud back where it was (if it moved)
   %vTempY = getWord(outerChatHud.position, 1) + getWord(outerChatHud.extent, 1) + 12;
   %mainCommX = firstWord(voiceCommHud.position);
   %commHudPos = %mainCommX SPC %vTempY;
   voiceCommHud.position = %commHudPos;

   Canvas.popDialog(%this);
   %this.setVisible(false);
   if ( $enableDirectInput )
      activateKeyboard();
   MessageHud_Edit.setValue("");
}

//------------------------------------------------------------------------------
function MessageHud::toggleState(%this)
{
   if(%this.isVisible())
      %this.close();
   else
      %this.open();
}

//------------------------------------------------------------------------------
function MessageHud_Edit::onEscape(%this)
{
   MessageHud.close();
}

//------------------------------------------------------------------------------
function MessageHud_Edit::eval(%this)
{
   %text = trim(%this.getValue());
   if(%text !$= "")
   {
      if(MessageHud.isTeamMsg)
         commandToServer('teamMessageSent', %text);
      else
         commandToServer('messageSent', %text);
   }

   MessageHud.close();
}

//------------------------------------------------------------------------------
// main chat hud
function MainChatHud::onWake( %this )
{
   // set the chat hud to the users pref
   %this.setChatHudLength( $Pref::ChatHudLength );
}

// chat hud sizes
$outerChatLenY[1] = 72;
$outerChatLenY[2] = 140;
$outerChatLenY[3] = 200;

// size for scroll
$chatScrollLenY[1] = 64;
$chatScrollLenY[2] = 128;
$chatScrollLenY[3] = 192;

//------------------------------------------------------------------------------
function MainChatHud::setChatHudLength( %this, %length )
{
   %outerChatLenX = firstWord(outerChatHud.extent);
   %chatScrollLenX = firstWord(chatScrollHud.extent);
   %OCHextent = %outerChatLenX SPC $outerChatLenY[%length];
   %CSHextent = %chatScrollLenX SPC $chatScrollLenY[%length];

   outerChatHud.extent = %OCHextent;
   chatScrollHud.extent = %CSHextent;
   
   %totalLines = HudMessageVector.getNumLines();
   %posLines = %length * 4;
   %linesOver = ( %totalLines - %posLines ) * 14;
   ChatPageDown.position = ( firstWord( outerChatHud.extent ) - 20 ) @ " " @ ( $chatScrollLenY[%length] - 6 );
   
   if( ( %linesOver > 0 ) && !%sizeIncrease )
   {
      %linesOver = %totalLines - %posLines;
      %posAdjust = %linesOver * ChatHud.profile.fontSize + 3;
      
      %newPos = "0" @ " " @ ( -1 * %posAdjust );   
      ChatHud.position = %newPos;
   }
   else if( %sizeIncrease && ( %linesOver > 0 ) )
   {
      %curPos = getWord( ChatHud.position, 1 );
      %newY = %curPos + ( 4 * 14 );
      %newPos = "0 " @ %newY;
      ChatHud.position = %newPos;
   }
   else if( %linesOver <= 0 )
   {
      ChatHud.position = "0 0";
   }
   
   // adjust votehud and voicecommhud to be just beneath chathud
   %tempY = getWord(outerChatHud.position, 1) + getWord(outerChatHud.extent, 1) + 2;
	%vTempY = %tempY + 10;
   %mainVoteX = firstWord(mainVoteHud.position);
	%vCommX = firstWord(voiceCommHud.position);
   %voteHudPos = %mainVoteX SPC %tempY;
	%vCommPos = %vCommX SPC %vTempY;
   mainVoteHud.position = %voteHudPos;
	voiceCommHud.position = %vCommPos;
   ChatHud.resize(firstWord(ChatHud.position), getWord(ChatHud.position, 1), firstWord(ChatHud.extent), getWord(ChatHud.extent, 1));
}

//------------------------------------------------------------------------------
function MainChatHud::nextChatHudLen( %this )
{
   $pref::chatHudLength++;
   if($pref::chatHudLength == 4)
   {
      $pref::chatHudLength = 1;
      %sizeIncrease = false;
      ChatPageDown.position = ( firstWord( outerChatHud.extent ) - 20 ) @ " 50";
   }
   else
      %sizeIncrease = true;

   %outerChatLenX = firstWord(outerChatHud.extent);
   %chatScrollLenX = firstWord(chatScrollHud.extent);
   %OCHextent = %outerChatLenX SPC $outerChatLenY[$pref::chatHudLength];
   %CSHextent = %chatScrollLenX SPC $chatScrollLenY[$pref::chatHudLength];

   outerChatHud.extent = %OCHextent;
   chatScrollHud.extent = %CSHextent;
   
   %totalLines = HudMessageVector.getNumLines();
   %posLines = $pref::chatHudLength * 4;
   %linesOver = %totalLines - %posLines;
   ChatPageDown.position = ( firstWord( outerChatHud.extent ) - 20 ) @ " " @ ( $chatScrollLenY[$pref::chatHudLength] - 6 );
   
   if( ( %linesOver > 0 ) && !%sizeIncrease )
   {
      %linesOver = %totalLines - %posLines;
      %posAdjust = %linesOver * $ShellFontSize;
      
      %newPos = "0" @ " " @ ( -1 * %posAdjust );   
      ChatHud.position = %newPos;
   }
   else if( %sizeIncrease && ( %linesOver > 0 ) )
   {
      %curPos = getWord( ChatHud.position, 1 );
      %newY = %curPos + ( 4 * $ShellFontSize );
      %newPos = "0 " @ %newY;
      ChatHud.position = %newPos;
   }
   else if( %linesOver <= 0 )
   {
      ChatHud.position = "0 0";
   }
   
   // adjust votehud to be just beneath chathud
   %tempY = getWord(outerChatHud.position, 1) + getWord(outerChatHud.extent, 1) + 2;
	%vTempY = %tempY + 10;
   %mainVoteX = firstWord(mainVoteHud.position);
	%vCommX = firstWord(voiceCommHud.position);
   %voteHudPos = %mainVoteX SPC %tempY;
	%vCommPos = %vCommX SPC %vTempY;
   mainVoteHud.position = %voteHudPos;
	voiceCommHud.position = %vCommPos;
   ChatHud.resize(firstWord(ChatHud.position), getWord(ChatHud.position, 1), firstWord(ChatHud.extent), getWord(ChatHud.extent, 1));
}
   
//----------------------------------------------------------------------------
// MessageHud key handlers
function ToggleMessageHud(%make)
{
   if(%make)
   {
      MessageHud.isTeamMsg = false;
      MessageHud.toggleState();
   }
}

//------------------------------------------------------------------------------
function TeamMessageHud(%make)
{
   if(%make)
   {
      MessageHud.isTeamMsg = true;
      MessageHud.toggleState();
   }
}

//----------------------------------------------------------------------------
// MessageHud message handlers
function serverCmdTeamMessageSent(%client, %text)
{
   if(strlen(%text) >= $Host::MaxMessageLen)
      %text = getSubStr(%text, 0, $Host::MaxMessageLen);
   chatMessageTeam(%client, %client.team, '\c3%1: %2', %client.name, %text);
}

//------------------------------------------------------------------------------
function serverCmdMessageSent(%client, %text)
{
   if(strlen(%text) >= $Host::MaxMessageLen)
      %text = getSubStr(%text, 0, $Host::MaxMessageLen);
   chatMessageAll(%client, '\c4%1: %2', %client.name, %text);
}

//--------------------------------------------------------------------------
function toggleHuds(%tag)
{
   if($Hud[%tag] && $Hud[%tag].pushed)
      hideHud(%tag); 
   else
      showHud(%tag);
}

//------------------------------------------------------------------------------

//modes are standard, pilot, passenger, object, observer
$HudMode = "Observer";
$HudModeType = "HoverBike";
$HudModeNode = 0;
function ClientCmdSetHudMode(%mode, %type, %node)
{
   $HudMode = detag(%mode);
   $HudModeType = detag(%type);
   $HudModeNode = %node;

   clientCmdDisplayHuds();
}

//------------------------------------------------------------------------------
$ControlObjectReticle[AABarrelLarge, bitmap] = "ret_chaingun";
$ControlObjectReticle[AABarrelLarge, frame] = true;
$ControlObjectReticle[ELFBarrelLarge, bitmap] = "ret_elf";
$ControlObjectReticle[ELFBarrelLarge, frame] = true;
$ControlObjectReticle[DeployableIndoorBarrel, bitmap] = "ret_blaster";
$ControlObjectReticle[DeployableIndoorBarrel, frame] = true;
$ControlObjectReticle[MissileBarrelLarge, bitmap] = "ret_missile";
$ControlObjectReticle[MissileBarrelLarge, frame] = true;
$ControlObjectReticle[MortarBarrelLarge, bitmap] = "ret_mortor";  // mortor? hahaha
$ControlObjectReticle[MortarBarrelLarge, frame] = true;
$ControlObjectReticle[DeployableOutdoorBarrel, bitmap] = "ret_blaster";
$ControlObjectReticle[DeployableOutdoorBarrel, frame] = true;
$ControlObjectReticle[PlasmaBarrelLarge, bitmap] = "ret_plasma";
$ControlObjectReticle[PlasmaBarrelLarge, frame] = true;
$ControlObjectReticle[SentryTurretBarrel, bitmap] = "ret_blaster";
$ControlObjectReticle[SentryTurretBarrel, frame] = true;

function setControlObjectReticle(%type)
{
   if($ControlObjectReticle[%type, bitmap] !$= "")
   {
      reticleHud.setBitmap("gui/" @ $ControlObjectReticle[%type, bitmap]);
      reticleFrameHud.setVisible($ControlObjectReticle[%type, frame]);

      retCenterHud.setVisible(true);
   }
   else
      retCenterHud.setVisible(false);
}

function updateActionMaps()
{
   //pop the action maps...
   if ( isObject( moveMap ) )
      moveMap.pop();
   if ( isObject( passengerKeys ) )
      passengerKeys.pop();
   if ( isObject( observerBlockMap ) )
      observerBlockMap.pop();
   if ( isObject( observerMap ) )
      observerMap.pop();
   if ( isObject( pickTeamMap ) )
      pickTeamMap.pop();
   if ( isObject( halftimeMap ) )
      halftimeMap.delete();

   //if (isObject(flyingCameraMove))
   //   flyingCameraMove.pop();
   if (isObject(ControlActionMap))
      ControlActionMap.pop();

   // push the proper map
   switch$ ($HudMode)
   {
      case "Pilot":
         passengerKeys.push();

      case "Passenger":
         moveMap.push();

      case "Object":
         moveMap.push();
         ControlActionMap.push();

      case "Observer":
         moveMap.push();
         if ( isObject( observerBlockMap ) )
            observerBlockMap.delete();
         // Create an action map just to block unwanted parts of the move map:
         new ActionMap( observerBlockMap );
         observerBlockMap.blockBind( moveMap, jump );
         observerBlockMap.blockBind( moveMap, mouseFire );
         observerBlockMap.blockBind( moveMap, mouseJet );
         observerBlockMap.blockBind( moveMap, toggleZoom );
         observerBlockMap.blockBind( moveMap, setZoomFOV );
         observerBlockMap.push();
         observerMap.push();
         // Make sure that "Spawn" is bound:
         if ( observerMap.getBinding( mouseFire ) $= "" )
            observerMap.copyBind( moveMap, mouseFire );
      
      case "PickTeam":
         ////////////////////////
         // pickTeam Keys
         //////////////////////
         if( !isObject( pickTeamMap ) )
            new ActionMap( pickTeamMap );
         pickTeamMap.copyBind( moveMap, toggleMessageHud );
         pickTeamMap.push();        
         
      case "SiegeHalftime":
         new ActionMap( halftimeMap );
         halftimeMap.bindCmd( keyboard, escape, "", "escapeFromGame();" );
         halftimeMap.copyBind( moveMap, toggleMessageHud );
         halftimeMap.copyBind( moveMap, teamMessageHud );
         halftimeMap.copyBind( moveMap, activateChatMenuHud );
         halftimeMap.copyBind( moveMap, resizeChatHud );
         halftimeMap.copyBind( moveMap, pageMessageHudUp );
         halftimeMap.copyBind( moveMap, pageMessageHudDown );
         halftimeMap.copyBind( moveMap, voiceCapture );
         halftimeMap.push();

      //case 'Standard':
      default:
         moveMap.push();
   }
}

//------------------------------------------------------------------------------
function ClientCmdDisplayHuds()
{
   if ( $LaunchMode $= "InteriorView" )
      return;

   // only update action maps if playGui is current content
   %content = Canvas.getContent();
   %PlayGuiActive = isObject(%content) && ( %content.getName() $= "PlayGui" );
   if ( %PlayGuiActive )
      updateActionMaps();

   ammoHud.setVisible(false);
   objectiveHud.setVisible(false);
   inventoryHud.setVisible(false);
   backpackFrame.setVisible(false);
   weaponsHud.setVisible(false);
   retCenterHud.setVisible(false);
   HudClusterBack.setVisible(false);
   outerChatHud.setVisible(false);
   clockHud.setVisible(false);
   controlObjectText.setVisible(false);
   siegeHalftimeHud.setVisible(false);
   clientCmdToggleDashHud(false);
   %hideCursor = true;

   switch$ ($HudMode)
   {
      case "Pilot":
         clientCmdShowVehicleGauges($HudModeType, $HudModeNode);
         clientCmdToggleDashHud(true);
         objectiveHud.setVisible(true);
         dashBoardHud.setposition(0, 0);
         retCenterHud.setVisible(true);
         HudClusterBack.setVisible(true);
         outerChatHud.setVisible(true);
         clockHud.setVisible(true);

      case "Passenger":
         clientCmdShowVehicleGauges($HudModeType, $HudModeNode);
         clientCmdToggleDashHud(true);
         objectiveHud.setVisible(true);
         dashBoardHud.setPosition(0, 0);
         ammoHud.setVisible(true);
         objectiveHud.setVisible(true);
         inventoryHud.setVisible(true);
         weaponsHud.setVisible(true);
			if(backpackFrame.pack)
				backpackFrame.setVisible(true);
         retCenterHud.setVisible(true);
         HudClusterBack.setVisible(true);
         outerChatHud.setVisible(true);
         clockHud.setVisible(true);

      case "Object":
         ammoHud.setVisible(true);
         HudClusterBack.setVisible(true);
         outerChatHud.setVisible(true);
         controlObjectText.setVisible(true);
         clockHud.setVisible(true);

         setControlObjectReticle($HudModeType);

      case "Observer":
         objectiveHud.setVisible(true);
         HudClusterBack.setVisible(true);
         outerChatHud.setVisible(true);
         clockHud.setVisible(true);
         
      case "SiegeHalftime":
         closeHud( "", "", 'scoreScreen' );
         closeHud( "", "", 'inventoryScreen' );
         closeHud( "", "", 'vehicleHud' );
         objectiveHud.setVisible(true);
         outerChatHud.setVisible(true);
         siegeHalftimeHud.setVisible(true);
         %hideCursor = false;
         
      case "PickTeam":
         ammoHud.setVisible(false);
         objectiveHud.setVisible(false);
         inventoryHud.setVisible(false);
         backpackFrame.setVisible(false);
         weaponsHud.setVisible(false);
         retCenterHud.setVisible(false);
         HudClusterBack.setVisible(false);
         outerChatHud.setVisible(true);
         controlObjectText.setVisible(false);
         clockHud.setVisible(false);

      //case 'Standard':
      default:
         ammoHud.setVisible(true);
         objectiveHud.setVisible(true);
         inventoryHud.setVisible(true);
         weaponsHud.setVisible(true);
			if(backpackFrame.pack)
				backpackFrame.setVisible(true);
         retCenterHud.setVisible(true);
         HudClusterBack.setVisible(true);
         outerChatHud.setVisible(true);
         clockHud.setVisible(true);
         
         if(voteHud.voting)
            mainVoteHud.setVisible(1);
         else
            mainVoteHud.setVisible(0);   
         
   }
   
   if ( PlayGui.hideCursor != %hideCursor )
   {
      PlayGui.hideCursor = %hideCursor;
      if ( %PlayGuiActive )
         Canvas.updateCursorState();
   }
}

function dashboardHud::onResize(%this, %width, %height)
{
   %currentWidth = getWord(dashboardHud.getPosition(), 0);
   %currentHeight = getWord(dashboardHud.getPosition(), 1);

   %screenWidth = getWord(getResolution(), 0);
   %screenHeight = getWord(getResolution(), 1);

   switch$ ($HudMode)
   {
      case "Pilot":
         if(%screenHeight <= 480)
         {  
            if($HudModeNode == 0)
               {  %xVal = 0; %yVal = 339; }
            else
               {  %xVal = 0; %yVal = 320; }
         }
         else if(%screenHeight <= 600)
         {  
            if($HudModeNode == 0)
               {  %xVal = 80; %yVal = 455; }
            else
               {  %xVal = 80; %yVal = 440; }
         }
         else
         {
            %xVal = (%screenWidth - 640) / 2;
            %yVal = (%screenheight - 480) + 360;   
         }

      case "Passenger":
         %xVal = (%screenWidth - 640) / 2;
         %yVal = (%screenheight - 480) + 360;   
   }

   if(%currentWidth != %xVal || %currentHeight != %yVal)
      dashBoardHud.setPosition(%xVal, %yVal);
}

function clientcmdTogglePlayHuds(%val)
{
   ammoHud.setVisible(%val);
   objectiveHud.setVisible(%val);
   inventoryHud.setVisible(%val);
   if(backpackFrame.pack)
      backpackFrame.setVisible(%val);
   weaponsHud.setVisible(%val);
   retCenterHud.setVisible(%val);
   HudClusterBack.setVisible(%val);
   outerChatHud.setVisible(%val);
   clockHud.setVisible(%val);
   
   if(%val)
   {   
      if(voteHud.voting)
         mainVoteHud.setVisible(1);
   }
   else
      mainVoteHud.setVisible(0);
}

//------------------------------------------------------------------------------
function toggleCursorHuds(%tag)
{
   if($Hud[%tag] !$= "" && $Hud[%tag].pushed)
   {
      hideHud(%tag);
      clientCmdTogglePlayHuds(true);
   }
   else
   {
      showHud(%tag);
      clientCmdTogglePlayHuds(false);
   }
}

//------------------------------------------------------------------------------
function showHud(%tag)
{
   commandToServer('ShowHud', %tag);
}

//------------------------------------------------------------------------------
function serverCmdShowHud(%client, %tag)
{
   %tagName = getWord(%tag, 1);
   %tag = getWord(%tag, 0);
   messageClient(%client, 'OpenHud', "", %tag);
   switch$ (%tag)
   {
      case 'inventoryScreen':
         %client.numFavsCount = 0;
         inventoryScreen::updateHud(1,%client,%tag);
      case 'vehicleHud':
         vehicleHud::updateHud(1,%client,%tag);
      case 'scoreScreen':
         updateScoreHudThread(%client, %tag);
   }
}

//------------------------------------------------------------------------------
function updateScoreHudThread(%client, %tag)
{
   Game.updateScoreHud(%client, %tag);
   cancel(%client.scoreHudThread);
   %client.scoreHudThread = schedule(3000, %client, "updateScoreHudThread", %client, %tag);
}

//------------------------------------------------------------------------------
function hideHud(%tag)
{
   commandToServer('HideHud', %tag);
}

//------------------------------------------------------------------------------
function serverCmdHideHud(%client, %tag)
{
   %tag = getWord(%tag, 0);
   messageClient(%client, 'CloseHud', "", %tag);
   switch$ (%tag)
   {
      case 'scoreScreen':
         cancel(%client.scoreHudThread);
         %client.scoreHudThread = "";
   }
}

//------------------------------------------------------------------------------
addMessageCallback('OpenHud', openHud);
addMessageCallback('CloseHud', closeHud);
addMessageCallback('ClearHud', clearHud);
addMessageCallback('SetLineHud', setLineHud);
addMessageCallback('RemoveLineHud', removeLineHud);

//------------------------------------------------------------------------------
function openHud(%msgType, %msgString, %tag)
{
   // Vehicle hud can only be pushed on the PlayGui:
   if ( %tag $= 'vehicleHud' && Canvas.getContent() != PlayGui.getId() )
      return;

   %tagName = getWord(%tag, 1);
   %tag = getWord(%tag, 0);
   if($Hud[%tag] $= "")
   {
      %tagName.loadHud(%tag);
      %tagName.setupHud(%tag);
   }
   Canvas.pushDialog($Hud[%tag]);
   $Hud[%tag].pushed = 1;
}

//------------------------------------------------------------------------------
function closeHud(%msgType, %msgString, %tag)
{
   %tag = getWord(%tag, 0);
   if($Hud[%tag].pushed)
   {
      $Hud[%tag].setVisible(false);
      Canvas.popDialog($Hud[%tag]);
      $Hud[%tag].pushed = 0;
   }
}

//------------------------------------------------------------------------------
function clearHud(%msgType, %msgString, %tag, %a0)
{
   %tag = getWord(%tag, 0);
   %startingLine = detag(%a0);

   while ($Hud[%tag].data[%startingLine, 0] !$= "")
   {
      for(%i = 0; %i < $Hud[%tag].numCol; %i++)
      {
         //remove and delete the hud line
         %obj = $Hud[%tag].data[%startingLine, %i];
         $Hud[%tag].childGui.remove(%obj);
         $Hud[%tag].data[%startingLine, %i] = "";
         %obj.delete();
      }

      %startingLine++;
   }

   //don't forget to adjust the size accordingly...
   if (%tag $= 'scoreScreen')
   {
      %height = 0;
      %guiCtrl = $Hud[%tag].childGui;

      if(isObject(%guiCtrl))
      {
         //set the new extent to be the position + extent of the last element...
         %height = 0;
         if (%guiCtrl.getCount() > 0)
         {
            %lastCtrl = %guiCtrl.getObject(%guiCtrl.getCount() - 1);
            %height = getWord(%lastCtrl.position, 1) + getWord(%lastCtrl.extent, 1);
         }

         //now reset the extent
         %guiCtrl.resize(getWord(%guiCtrl.position, 0), getWord(%guiCtrl.position, 1), getWord(%guiCtrl.extent, 0), %height);
      }
   }
}

//------------------------------------------------------------------------------
function removeLineHud(%msgType, %msgString, %hudName, %lineNumber, %a0, %a1, %a2, %a3)
{
   %tag = getWord(%hudName, 0);
   %lineNum = detag(%lineNumber);
   if($Hud[%tag].data[%lineNum,0] !$= "")
      for(%i = 0; %i < $Hud[%tag].numCol; %i++)
      {
         $Hud[%tag].childGui.remove($Hud[%tag].data[%lineNum, %i]);
         $Hud[%tag].data[%lineNum, %i] = "";
      }

   //don't forget to adjust the size accordingly...
   if (%tag $= 'scoreScreen')
   {
      %height = 0;
      %guiCtrl = $Hud[%tag].childGui;

      //set the new extent to be the position + extent of the last element...
      %height = 0;
      if (%guiCtrl.getCount() > 0)
      {
         %lastCtrl = %guiCtrl.getObject(%guiCtrl.getCount() - 1);
         %height = getWord(%lastCtrl.position, 1) + getWord(%lastCtrl.extent, 1);
      }

      //now reset the extent
      %guiCtrl.resize(getWord(%guiCtrl.position, 0), getWord(%guiCtrl.position, 1), getWord(%guiCtrl.extent, 0), %height);
   }
}

//------------------------------------------------------------------------------
function setLineHud(%msgType, %msgString, %hudName, %lineNumber, %a0, %a1, %a2, %a3, %a4)
{
   %tag = getWord(%hudName, 0);
   %lineNum = detag(%lineNumber);

   if(!isObject($Hud[%tag].data[%lineNum, 0]))
   {
      $Hud[%tag].numCol = addLine(%tag, %lineNum, %a0, %a1, %a2, %a3);
      for(%i = 0; %i < $Hud[%tag].numCol; %i++)
         $Hud[%tag].childGui.add($Hud[%tag].data[%lineNum, %i]);
   }

   for(%i = 0; %i < $Hud[%tag].numCol; %i++)
      $Hud[%tag].data[%lineNum, %i].hudSetValue(detag(%a[%i]),detag(%a4));   

   //don't forget to adjust the size accordingly...
   if (%tag $= 'scoreScreen')
   {
      %height = 0;
      %guiCtrl = $Hud[%tag].childGui;

      //set the new extent to be the position + extent of the last element...
      %height = 0;
      if (%guiCtrl.getCount() > 0)
      {
         %lastCtrl = %guiCtrl.getObject(%guiCtrl.getCount() - 1);
         %height = getWord(%lastCtrl.position, 1) + getWord(%lastCtrl.extent, 1);
      }

      //now reset the extent
      %guiCtrl.resize(getWord(%guiCtrl.position, 0), getWord(%guiCtrl.position, 1), getWord(%guiCtrl.extent, 0), %height);
   }
}

//------------------------------------------------------------------------------
function GuiButtonCtrl::hudSetValue(%obj, %text)
{
   %obj.setValue(%text);
}

//------------------------------------------------------------------------------
function GuiTextCtrl::hudSetValue(%obj, %text)
{
   %obj.setValue(%text);
}

//------------------------------------------------------------------------------
function GuiMLTextCtrl::hudSetValue(%obj, %text)
{
   %obj.setValue(%text);
}

//------------------------------------------------------------------------------
function GuiPopUpMenuCtrl::hudSetValue(%obj, %text, %textOverFlow)
{
   if(%textOverFlow !$= "")
      %text = %text @ %textOverFlow;
   %obj.clear();
   %value = getField(%text,0);
   %startVal = 1;
   if(%value $= "noSelect")
   {
      %obj.replaceText(false);
      %value = getField(%text,1);
      %startVal = 2;
   }
   else
      %obj.replaceText(true);

   %obj.setValue(%value);
   if(getFieldCount(%text) > 1)
   {
      %obj.setActive(true);
      for(%i = %startVal; %i < getFieldCount(%text); %i++)
         %obj.add(getField(%text, %i), %i);
   }
   else
      %obj.setActive(false);
}

//------------------------------------------------------------------------------
function ShellTabButton::hudSetValue( %obj, %text )
{
   %obj.setText( %text );
} 

//------------------------------------------------------------------------------
function addLine(%tag, %lineNum, %a0, %a1, %a2, %a3)
{
   %colNum = 0;
   if(isObject($Hud[%tag]))
      %colNum = $Hud[%tag].addLine(%tag, %lineNum, detag(%a2), detag(%a3));
   return %colNum;
}
 
//------------------------------------------------------------------------------
function INV_Menu::onSelect( %obj, %index, %text )
{
   %favList = $Hud['inventoryScreen'].data[0, 1].type TAB $Hud['inventoryScreen'].data[0, 1].getValue();
   for ( %i = 1; %i < $Hud['inventoryScreen'].count; %i++ )
      %favList = %favList TAB $Hud['inventoryScreen'].data[%i, 1].type TAB $Hud['inventoryScreen'].data[%i, 1].getValue();  
   commandToServer( 'setClientFav', %favList );   
}

//------------------------------------------------------------------------------
function INV_ListMenu::onSelect( %obj, %id, %text, %force )
{
   // Deselect the current tab ( because it was on the OLD list ):
   if ( InventoryScreen.selId !$= "" )
   {
      $Hud['inventoryScreen'].staticData[0, InventoryScreen.selId].setValue( false );
      InventoryScreen.selId = "";
   }

   $pref::FavCurrentList = %id;
   %favListStart = %id * 10;

   // Select the currently selected favorite if it is now visible:
   %tab = $pref::FavCurrentSelect - ( $pref::FavCurrentList * 10 ) + 1;
   if ( %tab > 0 && %tab < 11 )
   {
      InventoryScreen.selId = %tab;
      $Hud['inventoryScreen'].staticData[0, %tab].setValue( true );
   }

   %obj.clear();
   %obj.setValue( %text );
   %count = 10; 
   %list = 0;
   for ( %index = 0; $pref::FavNames[%index] !$= ""; %index++ )
   {
      if ( %index >= %count - 1 )
      {
         if ( %count != %favListStart + 10 )
            %obj.add( "Favorites " @ %index - 8 @ " - " @ %index + 1, %list );

         %count += 10;
         %list++;
      }
   }

   for ( %i = 0; %i < 10; %i++ )
   {
      $Hud['inventoryScreen'].staticData[0, %i + 1].command = "InventoryScreen.onTabSelect(" @ %favListStart + %i @ ");";
      $Hud['inventoryScreen'].staticData[0, %i + 1].setText( strupr( $pref::FavNames[%favListStart + %i] ) );
   }
}

//------------------------------------------------------------------------------
function serverCmdSetClientFav(%client, %text)
{
   if ( getWord( getField( %text, 0 ), 0 ) $= armor )
   {
      %client.curFavList = %text;
      %validList = checkInventory( %client, %text );
      %client.favorites[0] = getField( %text, 1 );
      %armor = getArmorDatablock( %client, $NameToInv[getField( %validList,1 )] );
      %weaponCount = 0;
      %packCount = 0;
      %grenadeCount = 0;
      %mineCount = 0;
      %count = 1;
      %client.weaponIndex = "";
      %client.packIndex = "";
      %client.grenadeIndex = "";
      %client.mineIndex = "";
      
      for(%i = 3; %i < getFieldCount(%validList); %i = %i + 2)
      {
         %setItem = false;
         switch$ (getField(%validList,%i-1))
         {
            case weapon:
               if(%weaponCount < %armor.maxWeapons)
               {
                  if(!%weaponCount)
                     %client.weaponIndex = %count;
                  else
                     %client.weaponIndex = %client.weaponIndex TAB %count;
                  %weaponCount++;
                  %setItem = true;   
               }   
            case pack:
               if(%packCount < 1)
               {
                  %client.packIndex = %count;         
                  %packCount++;
                  %setItem = true;
               }
            case grenade:
               if(%grenadeCount < %armor.maxGrenades)
               {
                  if(!%grenadeCount)
                     %client.grenadeIndex = %count;
                  else
                     %client.grenadeIndex = %client.grenadeIndex TAB %count;
                  %grenadeCount++;
                  %setItem = true;   
               }  
            case mine:
               if(%mineCount < %armor.maxMines)
               {
                  if(!%mineCount)
                     %client.mineIndex = %count;
                  else
                     %client.mineIndex = %client.mineIndex TAB %count;
                  %mineCount++;
                  %setItem = true;   
               }  
         }
         if(%setItem)
         {   
            %client.favorites[%count] = getField(%validList, %i);
            %count++;
         }
      }
      %client.numFavs = %count;
      %client.numFavsCount = 0;
      inventoryScreen::updateHud(1, %client, 'inventoryScreen');
   }
}

//------------------------------------------------------------------------------
function getCenterPos(%tag)
{
   %TerExtDivX = getWord(PlayGui.extent, 0) / 2;      
   %TerExtDivY = getWord(PlayGui.extent, 1) / 2;      
   
   %HudExtDivX = getWord($Hud[%tag].extent,0) / 2;
   %HudExtDivY = getWord($Hud[%tag].extent,1) / 2;

   %pos = %TerExtDivX - %HudExtDivX @ " " @ %TerExtDivY - %HudExtDivY;
   return %pos;
}

//------------------------------------------------------------------------------
function hideZoomHud()
{
   ZoomHud.setVisible(false);
   ZoomHud.hideThread = 0;
}

function calcZoomFOV()
{
   if($pref::player::currentFOV == $pref::player::defaultFov / 2)
      $pref::player::currentFOV = $pref::player::defaultFov / 5;   
   else 
      $pref::player::currentFOV = $pref::player::currentFOV / 2;   

   if($pref::player::currentFOV < 4)
      $pref::player::currentFOV = $pref::player::defaultFov / 2;                  
   
   if(!$ZoomOn)
   {
      %pos = getZoomCenter($pref::player::defaultFov / $pref::player::currentFOV);
      %extent = getZoomExtent($pref::player::defaultFov / $pref::player::currentFOV);
      ZoomHud.resize(getWord(%pos, 0), getWord(%pos, 1), getWord(%extent, 0), getWord(%extent, 1));
      if(ZoomHud.hideThread != 0)
         cancel(ZoomHud.hideThread);
      ZoomHud.hideThread = schedule(5000, 0, hideZoomHud);
      ZoomHud.setVisible(true);
   }
   else
      setFov( $pref::player::currentFOV );
}

//------------------------------------------------------------------------------
function getZoomCenter(%power)
{
   %power += (%power/4);
   %TerExtDivX = mFloor(getWord(PlayGui.extent, 0) / 2);      
   %TerExtDivY = mFloor(getWord(PlayGui.extent, 1) / 2);      
   
   %HudExtDivX = mFloor((getWord(PlayGui.extent, 0) / %power)/2);
   %HudExtDivY = mFloor((getWord(PlayGui.extent, 1) / %power)/2);

   %pos = %TerExtDivX - %HudExtDivX @ " " @ %TerExtDivY - %HudExtDivY;
   return %pos;
}

//------------------------------------------------------------------------------
function getZoomExtent(%power)
{
   %power += (%power/4);
   %HudExtDivX =  mFloor(getWord(PlayGui.extent, 0) / %power);
   %HudExtDivY =  mFloor(getWord(PlayGui.extent, 1) / %power);
   
   %val =  %HudExtDivX @ " " @ %HudExtDivY;

   return %val;
}

//------------------------------------------------------------------------------
function hideAllHuds()
{
   objectiveHud.setVisible( false );
   outerChatHud.setVisible( false );
   energyHud.setVisible( false );
   damageHud.setVisible( false );
   sensorHudBack.setVisible( false );
   controlObjectText.setVisible( false );
}

//------------------------------------------------------------------------------
function restoreAllHuds()
{
   objectiveHud.setVisible( true );
   outerChatHud.setVisible( true );
   energyHud.setVisible( true );
   damageHud.setVisible( true );
   sensorHudBack.setVisible( true );
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
// voting hud stuff
/////////////////////////////////////////////////
addMessageCallback('clearVoteHud', clearVoteHud);
addMessageCallback('addYesVote', addYesVote);
addMessageCallback('addNoVote', addNoVote);
addMessageCallback('openVoteHud', openVoteHud);
addMessageCallback('closeVoteHud', closeVoteHud);
addMessageCallback('VoteStarted', initVote);

//------------------------------------------------------------------------------
function initVote(%msgType, %msgString)
{
   if(!$BottomPrintActive)
   {
      %yBind = strUpr(getField(moveMap.getBinding(voteYes), 1));
      %nBind = strUpr(getField(moveMap.getBinding(voteNo), 1));
      
      %message = detag(%msgString) @ "\nPress " @ %yBind @ " to vote YES or " @ %nBind @ " to vote NO.";
      clientCmdBottomPrint(%message, 10, 2);
   }
}

function openVoteHud(%msgType, %msgString, %numClients, %passPercent)
{
   alxPlay(VoteInitiatedSound, 0, 0, 0);
   voteHud.voting = true;
   
   voteHud.totalVotes   = 0;
   voteHud.size         = %numClients;
   voteHud.quorum       = (%numClients / 2);
   
   if(voteHud.quorum < 1)
      voteHud.quorum = 1;
   
   voteHud.pass = voteHud.quorum * %passPercent;
      
   voteHud.setPassValue(%passPercent);
   passHash.position = firstWord( mainVoteHud.extent) * %passPercent + 1 @ " -1";
   
   if( MessageHud.isVisible() )
   {
      %votePos = firstWord( MainVoteHud.position ) @ " " @ ( getWord( OuterChatHud.extent, 1 ) + getWord( messageHud_Frame.extent, 1 ) + 12 );    
      MainVoteHud.position = %votePos;
   }
   else
   {
      %tempY = getWord(outerChatHud.position, 1) + getWord(outerChatHud.extent, 1) + 2;
      %mainVoteX = firstWord(mainVoteHud.position);
      %voteHudPos = %mainVoteX SPC %tempY;
      mainVoteHud.position = %voteHudPos;
   }
   
   voteHud.setVisible(true);
   mainVoteHud.setVisible(true);
}

function stripBind(%string)
{
   return getSubstr(%string, 9, 90);
}

//------------------------------------------------------------------------------
function CloseVoteHud(%msgType, %msgString)
{
   voteHud.setVisible(false);
   mainVoteHud.setVisible(false);
   voteHud.yesCount = 0;
   voteHud.noCount = 0;
   voteHud.voting = false;
}

//------------------------------------------------------------------------------
function addYesVote(%msgType, %msgString)
{
   voteHud.yesCount++;
   voteHud.totalVotes++;
   
   if(voteHud.isVisible())
   {   
      voteHud.setYesValue(voteHud.yesCount / voteHud.size);  
   }
}

//------------------------------------------------------------------------------
function addNoVote(%msgType, %msgString)
{
   voteHud.noCount++;
   voteHud.totalVotes++;
   
   if(voteHud.isVisible())
      voteHud.setNoValue(voteHud.noCount / voteHud.size);
}

//------------------------------------------------------------------------------
function clearVoteHud(%msgType, %msgString)
{
   voteHud.setYesValue(0.0);
   voteHud.setNoValue(0.0);
}

//------------------------------------------------------------------------------
function cleanUpHuds()
{
   if($Hud['inventoryScreen'] !$= "")
   {
      for(%lineNum = 0; $Hud['inventoryScreen'].data[%lineNum, 0] !$= ""; %lineNum++)
         for(%i = 0; %i < $Hud['inventoryScreen'].numCol; %i++)
         {
            $Hud['inventoryScreen'].childGui.remove($Hud['inventoryScreen'].data[%lineNum, %i]);
            $Hud['inventoryScreen'].data[%lineNum, %i] = "";      
         }
   }
}

function displayObserverHud(%client, %targetClient, %potentialClient)
{
   if (%targetClient > 0)
      bottomPrint(%client, "\nYou are now observing: " @ getTaggedString(%targetClient.name), 0, 3);
   else if (%potentialClient > 0)
      bottomPrint(%client, "\nObserver Fly Mode\n" @ getTaggedString(%potentialClient.name), 0, 3);    
   else
      bottomPrint(%client, "\nObserver Fly Mode", 0, 3);    
}

function hudFirstPersonToggled()
{
   ammoHud.setVisible($firstPerson);
}

$testCount = 0;

function testChatHud()
{
   $testCount++;
   messageAll( '', "This is test number " @ $testCount );
   $tester = schedule( 50, 0, "testChatHud");
}

//-------------------------------------------------------------------------
function HudNetDisplay::getPrefs(%this)
{
   for(%i = 0; %i < 6; %i++)
      %this.renderField[%i] = ($pref::Net::graphFields >> %i) & 1;
}

function NetBarHud::infoUpdate(%this, %ping, %packetLoss, %sendPackets, %sendBytes, %receivePackets, %receiveBytes)
{
   NetBarHudPingText.setText(mFormatFloat(%ping, "%4.0f") @ "ms");
   NetBarHudPacketLossText.setText(mFormatFloat(%packetLoss, "%3.0f") @ "%");
   
   NetBarHudSendBar.value = %sendPackets / $pref::Net::PacketRateToServer;
   NetBarHudReceiveBar.value = %receivePackets / $pref::Net::PacketRateToClient;
}
