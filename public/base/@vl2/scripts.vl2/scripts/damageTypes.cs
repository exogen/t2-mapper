//--------------------------------------------------------------------------
// TYPES OF ALLOWED DAMAGE
//--------------------------------------------------------------------------

$DamageType::Default    		= 0;
$DamageType::Blaster			= 1;
$DamageType::Plasma     		= 2;
$DamageType::Bullet     		= 3;
$DamageType::Disc				= 4;
$DamageType::Grenade			= 5;
$DamageType::Laser				= 6;     // NOTE: This value is referenced directly in code.  DO NOT CHANGE!
$DamageType::ELF				= 7;
$DamageType::Mortar				= 8;
$DamageType::Missile			= 9;
$DamageType::ShockLance			= 10;
$DamageType::Mine				= 11;
$DamageType::Explosion			= 12;
$DamageType::Impact				= 13;	// Object to object collisions
$DamageType::Ground				= 14;	// Object to ground collisions
$DamageType::Turret				= 15;

$DamageType::PlasmaTurret 		= 16;
$DamageType::AATurret	 		= 17;
$DamageType::ElfTurret 			= 18;
$DamageType::MortarTurret 		= 19;
$DamageType::MissileTurret 		= 20;
$DamageType::IndoorDepTurret	= 21;
$DamageType::OutdoorDepTurret	= 22;
$DamageType::SentryTurret		= 23;

$DamageType::OutOfBounds		= 24;
$DamageType::Lava				= 25;

$DamageType::ShrikeBlaster		= 26;
$DamageType::BellyTurret		= 27;
$DamageType::BomberBombs		= 28;
$DamageType::TankChaingun		= 29;
$DamageType::TankMortar			= 30;
$DamageType::SatchelCharge		= 31;
$DamageType::MPBMissile			= 32;
$DamageType::Lightning        = 33;
$DamageType::VehicleSpawn     = 34;
$DamageType::ForceFieldPowerup = 35;
$DamageType::Crash            = 36;

// DMM -- added so MPBs that blow up under water get a message
$DamageType::Water                      = 97;

//Tinman - used in Hunters for cheap bastards  ;)
$DamageType::NexusCamping		= 98;

// MES -- added so CTRL-K can get a distinctive message
$DamageType::Suicide			= 99;

// Etc, etc.

$DamageTypeText[0] = 'default';
$DamageTypeText[1] = 'blaster';
$DamageTypeText[2] = 'plasma';
$DamageTypeText[3] = 'chaingun';
$DamageTypeText[4] = 'disc';
$DamageTypeText[5] = 'grenade';
$DamageTypeText[6] = 'laser';
$DamageTypeText[7] = 'ELF';
$DamageTypeText[8] = 'mortar';
$DamageTypeText[9] = 'missile';
$DamageTypeText[10] = 'shocklance';
$DamageTypeText[11] = 'mine';
$DamageTypeText[12] = 'explosion';
$DamageTypeText[13] = 'impact';
$DamageTypeText[14] = 'ground';
$DamageTypeText[15] = 'turret';
$DamageTypeText[16] = 'plasma turret';
$DamageTypeText[17] = 'AA turret';
$DamageTypeText[18] = 'ELF turret';
$DamageTypeText[19] = 'mortar turret';
$DamageTypeText[20] = 'missile turret';
$DamageTypeText[21] = 'clamp turret';
$DamageTypeText[22] = 'spike turret';
$DamageTypeText[23] = 'sentry turret';
$DamageTypeText[24] = 'out of bounds';
$DamageTypeText[25] = 'lava';
$DamageTypeText[26] = 'shrike blaster';
$DamageTypeText[27] = 'belly turret';
$DamageTypeText[28] = 'bomber bomb';
$DamageTypeText[29] = 'tank chaingun';
$DamageTypeText[30] = 'tank mortar';
$DamageTypeText[31] = 'satchel charge';
$DamageTypeText[32] = 'MPB missile';
$DamageTypeText[33] = 'lighting';
$DamageTypeText[35] = 'ForceField';
$DamageTypeText[36] = 'Crash';
$DamageTypeText[98] = 'nexus camping';
$DamageTypeText[99] = 'suicide';


// ##### PLEASE DO NOT REORDER THE DAMAGE PROFILE TABLES BELOW #####
// (They are set up in the same order as the "Weapons Matrix.xls" sheet for ease of reference when balancing)

//----------------------------------------------------------------------------
// VEHICLE DAMAGE PROFILES
//----------------------------------------------------------------------------

//**** SHRIKE SCOUT FIGHTER ****
datablock SimDataBlock(ShrikeDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] 			= 1.75;
   shieldDamageScale[$DamageType::Bullet] 			= 1.75;
   shieldDamageScale[$DamageType::ELF] 				= 1.0;
   shieldDamageScale[$DamageType::ShockLance] 		= 0.5;
   shieldDamageScale[$DamageType::Laser] 			= 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] 	= 4.0;
   shieldDamageScale[$DamageType::BellyTurret] 		= 2.0;
   shieldDamageScale[$DamageType::AATurret] 		= 3.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] 	= 2.5;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 2.5;
   shieldDamageScale[$DamageType::SentryTurret] 	= 2.5;
   shieldDamageScale[$DamageType::Disc] 			= 1.5;
   shieldDamageScale[$DamageType::Grenade] 			= 1.0;
   shieldDamageScale[$DamageType::Mine] 			= 3.0;
   shieldDamageScale[$DamageType::Missile] 			= 3.0;
   shieldDamageScale[$DamageType::Mortar] 			= 2.0;
   shieldDamageScale[$DamageType::Plasma] 			= 1.0;
   shieldDamageScale[$DamageType::BomberBombs] 		= 3.0;
   shieldDamageScale[$DamageType::TankChaingun] 	= 3.0;
   shieldDamageScale[$DamageType::TankMortar] 		= 2.0;
   shieldDamageScale[$DamageType::MissileTurret] 	= 3.0;
   shieldDamageScale[$DamageType::MortarTurret] 	= 2.0;
   shieldDamageScale[$DamageType::PlasmaTurret] 	= 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] 	= 3.5;
   shieldDamageScale[$DamageType::Default] 			= 1.0;
   shieldDamageScale[$DamageType::Impact] 			= 1.1;
   shieldDamageScale[$DamageType::Ground] 			= 1.0;
   shieldDamageScale[$DamageType::Explosion] 		= 3.0;
   shieldDamageScale[$DamageType::Lightning] 		= 10.0;

   damageScale[$DamageType::Blaster] 				= 1.0;
   damageScale[$DamageType::Bullet] 				= 1.0;
   damageScale[$DamageType::ELF] 					= 0.0;
   damageScale[$DamageType::ShockLance] 			= 0.50;
   damageScale[$DamageType::Laser] 					= 1.0;
   damageScale[$DamageType::ShrikeBlaster] 			= 3.5;
   damageScale[$DamageType::BellyTurret] 			= 1.2;
   damageScale[$DamageType::AATurret] 				= 1.5;
   damageScale[$DamageType::IndoorDepTurret] 		= 1.5;
   damageScale[$DamageType::OutdoorDepTurret] 		= 1.5;
   damageScale[$DamageType::SentryTurret] 			= 1.5;
   damageScale[$DamageType::Disc] 					= 1.25;
   damageScale[$DamageType::Grenade] 				= 0.75;
   damageScale[$DamageType::Mine] 					= 4.0;
   damageScale[$DamageType::Missile] 				= 2.0;
   damageScale[$DamageType::Mortar] 				= 2.0;
   damageScale[$DamageType::Plasma] 				= 0.5;
   damageScale[$DamageType::BomberBombs] 			= 2.0;
   damageScale[$DamageType::TankChaingun] 			= 2.0;
   damageScale[$DamageType::TankMortar] 			= 2.0;
   damageScale[$DamageType::MissileTurret] 			= 1.5;
   damageScale[$DamageType::MortarTurret] 			= 2.0;
   damageScale[$DamageType::PlasmaTurret] 			= 2.0;
   damageScale[$DamageType::SatchelCharge] 			= 3.5;
   damageScale[$DamageType::Default] 				= 1.0;
   damageScale[$DamageType::Impact] 				= 1.1;
   damageScale[$DamageType::Ground] 				= 1.0;
   damageScale[$DamageType::Explosion] 				= 2.0;
   damageScale[$DamageType::Lightning] 				= 10.0;
};

//**** THUNDERSWORD BOMBER ****
datablock SimDataBlock(BomberDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] 			= 1.0;
   shieldDamageScale[$DamageType::Bullet] 			= 1.0;
   shieldDamageScale[$DamageType::ELF] 				= 1.0;
   shieldDamageScale[$DamageType::ShockLance] 		= 0.5;
   shieldDamageScale[$DamageType::Laser] 			= 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] 	= 3.5;
   shieldDamageScale[$DamageType::BellyTurret] 		= 2.0;
   shieldDamageScale[$DamageType::AATurret] 		= 3.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] 	= 2.25;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 2.25;
   shieldDamageScale[$DamageType::SentryTurret] 	= 2.25;
   shieldDamageScale[$DamageType::Disc] 			= 1.0;
   shieldDamageScale[$DamageType::Grenade] 			= 1.0;
   shieldDamageScale[$DamageType::Mine] 			= 3.0;
   shieldDamageScale[$DamageType::Missile] 			= 3.0;
   shieldDamageScale[$DamageType::Mortar] 			= 2.0;
   shieldDamageScale[$DamageType::Plasma] 			= 1.0;
   shieldDamageScale[$DamageType::BomberBombs] 		= 3.0;
   shieldDamageScale[$DamageType::TankChaingun] 	= 3.0;
   shieldDamageScale[$DamageType::TankMortar] 		= 2.0;
   shieldDamageScale[$DamageType::MissileTurret] 	= 3.0;
   shieldDamageScale[$DamageType::MortarTurret] 	= 2.0;
   shieldDamageScale[$DamageType::PlasmaTurret] 	= 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] 	= 3.5;
   shieldDamageScale[$DamageType::Default] 			= 1.0;
   shieldDamageScale[$DamageType::Impact] 			= 0.8;
   shieldDamageScale[$DamageType::Ground] 			= 1.0;
   shieldDamageScale[$DamageType::Explosion] 		= 3.0;
   shieldDamageScale[$DamageType::Lightning] 		= 10.0;

   damageScale[$DamageType::Blaster] 				= 0.75;
   damageScale[$DamageType::Bullet] 				= 0.75;
   damageScale[$DamageType::ELF] 					= 0.0;
   damageScale[$DamageType::ShockLance] 			= 0.50;
   damageScale[$DamageType::Laser] 					= 1.0;
   damageScale[$DamageType::ShrikeBlaster] 			= 2.5;
   damageScale[$DamageType::BellyTurret] 			= 1.2;
   damageScale[$DamageType::AATurret] 				= 1.5;
   damageScale[$DamageType::IndoorDepTurret] 		= 1.25;
   damageScale[$DamageType::OutdoorDepTurret] 		= 1.25;
   damageScale[$DamageType::SentryTurret] 			= 1.25;
   damageScale[$DamageType::Disc] 					= 1.0;
   damageScale[$DamageType::Grenade] 				= 0.75;
   damageScale[$DamageType::Mine] 					= 4.0;
   damageScale[$DamageType::Missile] 				= 1.5;
   damageScale[$DamageType::Mortar] 				= 2.0;
   damageScale[$DamageType::Plasma] 				= 0.5;
   damageScale[$DamageType::BomberBombs] 			= 2.0;
   damageScale[$DamageType::TankChaingun] 			= 2.0;
   damageScale[$DamageType::TankMortar] 			= 2.0;
   damageScale[$DamageType::MissileTurret] 			= 1.5;
   damageScale[$DamageType::MortarTurret] 			= 2.0;
   damageScale[$DamageType::PlasmaTurret] 			= 2.0;
   damageScale[$DamageType::SatchelCharge] 			= 3.5;
   damageScale[$DamageType::Default] 				= 1.0;
   damageScale[$DamageType::Impact] 				= 0.8;
   damageScale[$DamageType::Ground] 				= 1.0;
   damageScale[$DamageType::Explosion] 				= 2.0;
   damageScale[$DamageType::Lightning] 				= 10.0;
};

//**** HAVOC TRANSPORT ****
datablock SimDataBlock(HavocDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] 			= 1.0;
   shieldDamageScale[$DamageType::Bullet] 			= 1.0;
   shieldDamageScale[$DamageType::ELF] 				= 1.0;
   shieldDamageScale[$DamageType::ShockLance] 		= 0.5;
   shieldDamageScale[$DamageType::Laser] 			= 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] 	= 3.5;
   shieldDamageScale[$DamageType::BellyTurret] 		= 2.0;
   shieldDamageScale[$DamageType::AATurret] 		= 3.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] 	= 2.25;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 2.25;
   shieldDamageScale[$DamageType::SentryTurret] 	= 2.25;
   shieldDamageScale[$DamageType::Disc] 			= 1.0;
   shieldDamageScale[$DamageType::Grenade] 			= 1.0;
   shieldDamageScale[$DamageType::Mine] 			= 3.0;
   shieldDamageScale[$DamageType::Missile] 			= 3.0;
   shieldDamageScale[$DamageType::Mortar] 			= 2.0;
   shieldDamageScale[$DamageType::Plasma] 			= 1.0;
   shieldDamageScale[$DamageType::BomberBombs] 		= 3.0;
   shieldDamageScale[$DamageType::TankChaingun] 	= 3.0;
   shieldDamageScale[$DamageType::TankMortar] 		= 2.0;
   shieldDamageScale[$DamageType::MissileTurret] 	= 3.0;
   shieldDamageScale[$DamageType::MortarTurret] 	= 2.0;
   shieldDamageScale[$DamageType::PlasmaTurret] 	= 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] 	= 3.5;
   shieldDamageScale[$DamageType::Default] 			= 1.0;
   shieldDamageScale[$DamageType::Impact] 			= 0.5;
   shieldDamageScale[$DamageType::Ground] 			= 1.0;
   shieldDamageScale[$DamageType::Explosion] 		= 3.0;
   shieldDamageScale[$DamageType::Lightning] 		= 10.0;

   damageScale[$DamageType::Blaster] 				= 0.75;
   damageScale[$DamageType::Bullet] 				= 0.75;
   damageScale[$DamageType::ELF] 					= 0.0;
   damageScale[$DamageType::ShockLance] 			= 0.50;
   damageScale[$DamageType::Laser] 					= 1.0;
   damageScale[$DamageType::ShrikeBlaster] 			= 2.5;
   damageScale[$DamageType::BellyTurret] 			= 1.2;
   damageScale[$DamageType::AATurret] 				= 1.5;
   damageScale[$DamageType::IndoorDepTurret] 		= 1.25;
   damageScale[$DamageType::OutdoorDepTurret] 		= 1.25;
   damageScale[$DamageType::SentryTurret] 			= 1.25;
   damageScale[$DamageType::Disc] 					= 1.0;
   damageScale[$DamageType::Grenade] 				= 0.75;
   damageScale[$DamageType::Mine] 					= 4.0;
   damageScale[$DamageType::Missile] 				= 1.5;
   damageScale[$DamageType::Mortar] 				= 2.0;
   damageScale[$DamageType::Plasma] 				= 0.5;
   damageScale[$DamageType::BomberBombs] 			= 2.0;
   damageScale[$DamageType::TankChaingun] 			= 2.0;
   damageScale[$DamageType::TankMortar] 			= 2.0;
   damageScale[$DamageType::MissileTurret] 			= 1.5;
   damageScale[$DamageType::MortarTurret] 			= 2.0;
   damageScale[$DamageType::PlasmaTurret] 			= 2.0;
   damageScale[$DamageType::SatchelCharge] 			= 3.5;
   damageScale[$DamageType::Default] 				= 1.0;
   damageScale[$DamageType::Impact] 				= 0.5;
   damageScale[$DamageType::Ground] 				= 1.0;
   damageScale[$DamageType::Explosion] 				= 2.0;
   damageScale[$DamageType::Lightning] 				= 10.0;
};

//**** WILDCAT GRAV CYCLE ****
datablock SimDataBlock(WildcatDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] 			= 2.0;
   shieldDamageScale[$DamageType::Bullet] 			= 2.5;
   shieldDamageScale[$DamageType::ELF] 				= 1.0;
   shieldDamageScale[$DamageType::ShockLance] 		= 1.0;
   shieldDamageScale[$DamageType::Laser] 			= 4.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] 	= 6.0;
   shieldDamageScale[$DamageType::BellyTurret] 		= 2.0;
   shieldDamageScale[$DamageType::AATurret] 		= 2.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] 	= 2.5;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 2.5;
   shieldDamageScale[$DamageType::Disc] 			= 2.5;
   shieldDamageScale[$DamageType::Grenade] 			= 2.0;
   shieldDamageScale[$DamageType::Mine] 			= 4.0;
   shieldDamageScale[$DamageType::Missile] 			= 4.0;
   shieldDamageScale[$DamageType::Mortar] 			= 2.0;
   shieldDamageScale[$DamageType::Plasma] 			= 2.0;
   shieldDamageScale[$DamageType::BomberBombs] 		= 2.5;
   shieldDamageScale[$DamageType::TankChaingun] 	= 3.0;
   shieldDamageScale[$DamageType::TankMortar] 		= 2.0;
   shieldDamageScale[$DamageType::MissileTurret] 	= 4.0;
   shieldDamageScale[$DamageType::MortarTurret] 	= 2.0;
   shieldDamageScale[$DamageType::PlasmaTurret] 	= 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] 	= 3.0;
   shieldDamageScale[$DamageType::Default] 			= 1.0;
   shieldDamageScale[$DamageType::Impact] 			= 1.25;
   shieldDamageScale[$DamageType::Ground] 			= 1.0;
   shieldDamageScale[$DamageType::Explosion] 		= 2.0;
   shieldDamageScale[$DamageType::Lightning] 		= 5.0;

   damageScale[$DamageType::Blaster] = 1.5;
   damageScale[$DamageType::Bullet] = 1.2;
   damageScale[$DamageType::ELF] = 0.0;
   damageScale[$DamageType::ShockLance] = 0.50;
   damageScale[$DamageType::Laser] = 2.0;
   damageScale[$DamageType::ShrikeBlaster] = 4.0;
   damageScale[$DamageType::BellyTurret] = 1.5;
   damageScale[$DamageType::AATurret] = 1.0;
   damageScale[$DamageType::IndoorDepTurret] = 1.0;
   damageScale[$DamageType::OutdoorDepTurret] = 1.0;
   damageScale[$DamageType::Disc] = 1.25;
   damageScale[$DamageType::Grenade] = 1.0;
   damageScale[$DamageType::Mine] = 4.0;
   damageScale[$DamageType::Missile] = 1.2;
   damageScale[$DamageType::Mortar] = 1.0;
   damageScale[$DamageType::Plasma] = 1.5;
   damageScale[$DamageType::BomberBombs] = 2.0;
   damageScale[$DamageType::TankChaingun] = 2.0;
   damageScale[$DamageType::TankMortar] = 1.0;
   damageScale[$DamageType::MissileTurret] = 1.2;
   damageScale[$DamageType::MortarTurret] = 1.0;
   damageScale[$DamageType::PlasmaTurret] = 1.0;
   damageScale[$DamageType::SatchelCharge] = 2.2;
   damageScale[$DamageType::Default] = 1.0;
   damageScale[$DamageType::Impact] = 1.25;
   damageScale[$DamageType::Ground] = 1.0;
   damageScale[$DamageType::Explosion] = 1.0;
   damageScale[$DamageType::Lightning]	= 5.0;
};

//**** BEOWULF TANK ****
datablock SimDataBlock(TankDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] = 0.6;
   shieldDamageScale[$DamageType::Bullet] = 0.75;
   shieldDamageScale[$DamageType::ELF] = 1.0;
   shieldDamageScale[$DamageType::ShockLance] = 0.5;
   shieldDamageScale[$DamageType::Laser] = 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] = 1.75;
   shieldDamageScale[$DamageType::BellyTurret] = 1.25;
   shieldDamageScale[$DamageType::AATurret] = 0.8;
   shieldDamageScale[$DamageType::IndoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::Disc] = 0.8;
   shieldDamageScale[$DamageType::Grenade] = 0.8;
   shieldDamageScale[$DamageType::Mine] = 3.25;
   shieldDamageScale[$DamageType::Missile] = 2.0;
   shieldDamageScale[$DamageType::Mortar] = 1.7;
   shieldDamageScale[$DamageType::Plasma] = 1.0;
   shieldDamageScale[$DamageType::BomberBombs] = 1.5;
   shieldDamageScale[$DamageType::TankChaingun] = 1.5;
   shieldDamageScale[$DamageType::TankMortar] = 1.8;
   shieldDamageScale[$DamageType::MissileTurret] = 1.25;
   shieldDamageScale[$DamageType::MortarTurret] = 1.0;
   shieldDamageScale[$DamageType::PlasmaTurret] = 1.25;
   shieldDamageScale[$DamageType::SatchelCharge] = 2.0;
   shieldDamageScale[$DamageType::Default] = 1.0;
   shieldDamageScale[$DamageType::Impact] = 0.75;
   shieldDamageScale[$DamageType::Ground] = 0.75;
   shieldDamageScale[$DamageType::Explosion] = 2.0;
   shieldDamageScale[$DamageType::Lightning] = 10.0;

   damageScale[$DamageType::Blaster] = 0.75;
   damageScale[$DamageType::Bullet] = 0.75;
   damageScale[$DamageType::ELF] = 0.0;
   damageScale[$DamageType::ShockLance] = 0.50;
   damageScale[$DamageType::Laser] = 1.0;
   damageScale[$DamageType::ShrikeBlaster] = 2.0;
   damageScale[$DamageType::BellyTurret] = 1.0;
   damageScale[$DamageType::AATurret] = 1.0;
   damageScale[$DamageType::IndoorDepTurret] = 1.0;
   damageScale[$DamageType::OutdoorDepTurret] = 1.0;
   damageScale[$DamageType::Disc] = 1.0;
   damageScale[$DamageType::Grenade] = 1.0;
   damageScale[$DamageType::Mine] = 2.25;
   damageScale[$DamageType::Missile] = 1.25;
   damageScale[$DamageType::Mortar] = 1.4;
   damageScale[$DamageType::Plasma] = 0.5;
   damageScale[$DamageType::BomberBombs] = 1.0;
   damageScale[$DamageType::TankChaingun] = 0.75;
   damageScale[$DamageType::TankMortar] = 1.6;
   damageScale[$DamageType::MissileTurret] = 1.25;
   damageScale[$DamageType::MortarTurret] = 1.0;
   damageScale[$DamageType::PlasmaTurret] = 1.0;
   damageScale[$DamageType::SatchelCharge] = 2.0;
   damageScale[$DamageType::Default] = 1.0;
   damageScale[$DamageType::Impact] = 0.75;
   damageScale[$DamageType::Ground] = 0.75;
   damageScale[$DamageType::Explosion] = 1.0;
   damageScale[$DamageType::Lightning]	= 10.0;
};

//**** JERICHO MPB ****
datablock SimDataBlock(MPBDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] = 0.6;
   shieldDamageScale[$DamageType::Bullet] = 0.75;
   shieldDamageScale[$DamageType::ELF] = 1.0;
   shieldDamageScale[$DamageType::ShockLance] = 0.5;
   shieldDamageScale[$DamageType::Laser] = 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] = 1.75;
   shieldDamageScale[$DamageType::BellyTurret] = 1.25;
   shieldDamageScale[$DamageType::AATurret] = 0.8;
   shieldDamageScale[$DamageType::IndoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::Disc] = 0.8;
   shieldDamageScale[$DamageType::Grenade] = 0.8;
   shieldDamageScale[$DamageType::Mine] = 3.25;
   shieldDamageScale[$DamageType::Missile] = 2.0;
   shieldDamageScale[$DamageType::Mortar] = 0.8;
   shieldDamageScale[$DamageType::Plasma] = 1.0;
   shieldDamageScale[$DamageType::BomberBombs] = 1.5;
   shieldDamageScale[$DamageType::TankChaingun] = 1.5;
   shieldDamageScale[$DamageType::TankMortar] = 1.4;
   shieldDamageScale[$DamageType::MissileTurret] = 1.25;
   shieldDamageScale[$DamageType::MortarTurret] = 1.0;
   shieldDamageScale[$DamageType::PlasmaTurret] = 1.25;
   shieldDamageScale[$DamageType::SatchelCharge] = 2.0;
   shieldDamageScale[$DamageType::Default] = 1.0;
   shieldDamageScale[$DamageType::Impact] = 0.5;
   shieldDamageScale[$DamageType::Ground] = 0.5;
   shieldDamageScale[$DamageType::Explosion] = 2.0;
   shieldDamageScale[$DamageType::Lightning] = 10.0;

   damageScale[$DamageType::Blaster] = 0.75;
   damageScale[$DamageType::Bullet] = 0.75;
   damageScale[$DamageType::ELF] = 0.0;
   damageScale[$DamageType::ShockLance] = 0.50;
   damageScale[$DamageType::Laser] = 1.0;
   damageScale[$DamageType::ShrikeBlaster] = 2.0;
   damageScale[$DamageType::BellyTurret] = 1.0;
   damageScale[$DamageType::AATurret] = 1.0;
   damageScale[$DamageType::IndoorDepTurret] = 1.0;
   damageScale[$DamageType::OutdoorDepTurret] = 1.0;
   damageScale[$DamageType::Disc] = 1.0;
   damageScale[$DamageType::Grenade] = 1.0;
   damageScale[$DamageType::Mine] = 2.25;
   damageScale[$DamageType::Missile] = 1.25;
   damageScale[$DamageType::Mortar] = 1.0;
   damageScale[$DamageType::Plasma] = 0.5;
   damageScale[$DamageType::BomberBombs] = 1.0;
   damageScale[$DamageType::TankChaingun] = 0.75;
   damageScale[$DamageType::TankMortar] = 1.0;
   damageScale[$DamageType::MissileTurret] = 1.25;
   damageScale[$DamageType::MortarTurret] = 1.0;
   damageScale[$DamageType::PlasmaTurret] = 1.0;
   damageScale[$DamageType::SatchelCharge] = 2.0;
   damageScale[$DamageType::Default] = 1.0;
   damageScale[$DamageType::Impact] = 0.5;
   damageScale[$DamageType::Ground] = 0.5;
   damageScale[$DamageType::Explosion] = 1.0;
   damageScale[$DamageType::Lightning]	= 10.0;
};

//----------------------------------------------------------------------------
// TURRET DAMAGE PROFILES
//----------------------------------------------------------------------------

datablock SimDataBlock(TurretDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] = 0.8;
   shieldDamageScale[$DamageType::Bullet] = 0.8;
   shieldDamageScale[$DamageType::ELF] = 1.0;
   shieldDamageScale[$DamageType::ShockLance] = 0.5;
   shieldDamageScale[$DamageType::Laser] = 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] = 3.0;
   shieldDamageScale[$DamageType::BellyTurret] = 2.0;
   shieldDamageScale[$DamageType::AATurret] = 1.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::SentryTurret] = 1.0;
   shieldDamageScale[$DamageType::Disc] = 1.0;
   shieldDamageScale[$DamageType::Grenade] = 1.5;
   shieldDamageScale[$DamageType::Mine] = 3.0;
   shieldDamageScale[$DamageType::Missile] = 3.0;
   shieldDamageScale[$DamageType::Mortar] = 3.0;
   shieldDamageScale[$DamageType::Plasma] = 1.0;
   shieldDamageScale[$DamageType::BomberBombs] = 2.0;
   shieldDamageScale[$DamageType::TankChaingun] = 1.5;
   shieldDamageScale[$DamageType::TankMortar] = 3.0;
   shieldDamageScale[$DamageType::MissileTurret] = 3.0;
   shieldDamageScale[$DamageType::MortarTurret] = 3.0;
   shieldDamageScale[$DamageType::PlasmaTurret] = 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] = 4.5;
   shieldDamageScale[$DamageType::Default] = 1.0;
   shieldDamageScale[$DamageType::Impact] = 1.0;
   shieldDamageScale[$DamageType::Ground] = 1.0;
   shieldDamageScale[$DamageType::Explosion] = 2.0;
   shieldDamageScale[$DamageType::Lightning]	= 5.0;

   damageScale[$DamageType::Blaster] = 0.8;
   damageScale[$DamageType::Bullet] = 0.9;
   damageScale[$DamageType::ELF] = 0.0;
   damageScale[$DamageType::ShockLance] = 0.50;
   damageScale[$DamageType::Laser] = 1.0;
   damageScale[$DamageType::ShrikeBlaster] = 1.0;
   damageScale[$DamageType::BellyTurret] = 0.6;
   damageScale[$DamageType::AATurret] = 1.0;
   damageScale[$DamageType::IndoorDepTurret] = 1.0;
   damageScale[$DamageType::OutdoorDepTurret] = 1.0;
   damageScale[$DamageType::SentryTurret] = 1.0;
   damageScale[$DamageType::Disc] = 1.1;
   damageScale[$DamageType::Grenade] = 1.0;
   damageScale[$DamageType::Mine] = 1.5;
   damageScale[$DamageType::Missile] = 1.25;
   damageScale[$DamageType::Mortar] = 1.25;
   damageScale[$DamageType::Plasma] = 0.75;
   damageScale[$DamageType::BomberBombs] = 1.0;
   damageScale[$DamageType::TankChaingun] = 1.25;
   damageScale[$DamageType::TankMortar] = 1.25;
   damageScale[$DamageType::MissileTurret] = 1.25;
   damageScale[$DamageType::MortarTurret] = 1.25;
   damageScale[$DamageType::PlasmaTurret] = 1.25;
   damageScale[$DamageType::SatchelCharge] = 1.5;
   damageScale[$DamageType::Default] = 1.0;
   damageScale[$DamageType::Impact] = 1.0;
   damageScale[$DamageType::Ground] = 1.0;
   damageScale[$DamageType::Explosion] = 1.0;
   damageScale[$DamageType::Lightning]	= 5.0;
};

//----------------------------------------------------------------------------
// STATIC SHAPE DAMAGE PROFILES
//----------------------------------------------------------------------------

datablock SimDataBlock(StaticShapeDamageProfile)
{
   shieldDamageScale[$DamageType::Blaster] = 0.8;
   shieldDamageScale[$DamageType::Bullet] = 1.0;
   shieldDamageScale[$DamageType::ELF] = 1.0;
   shieldDamageScale[$DamageType::ShockLance] = 1.0;
   shieldDamageScale[$DamageType::Laser] = 1.0;
   shieldDamageScale[$DamageType::ShrikeBlaster] = 2.0;
   shieldDamageScale[$DamageType::BellyTurret] = 1.5;
   shieldDamageScale[$DamageType::AATurret] = 1.0;
   shieldDamageScale[$DamageType::IndoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::OutdoorDepTurret] = 1.0;
   shieldDamageScale[$DamageType::Turret] = 1.0;
   shieldDamageScale[$DamageType::SentryTurret] = 1.0;
   shieldDamageScale[$DamageType::Disc] = 1.0;
   shieldDamageScale[$DamageType::Grenade] = 1.2;
   shieldDamageScale[$DamageType::Mine] = 2.0;
   shieldDamageScale[$DamageType::Missile] = 3.0;
   shieldDamageScale[$DamageType::Mortar] = 3.0;
   shieldDamageScale[$DamageType::Plasma] = 1.5;
   shieldDamageScale[$DamageType::BomberBombs] = 2.0;
   shieldDamageScale[$DamageType::TankChaingun] = 1.5;
   shieldDamageScale[$DamageType::TankMortar] = 3.0;
   shieldDamageScale[$DamageType::MissileTurret] = 3.0;
   shieldDamageScale[$DamageType::MortarTurret] = 3.0;
   shieldDamageScale[$DamageType::PlasmaTurret] = 2.0;
   shieldDamageScale[$DamageType::SatchelCharge] = 6.0;
   shieldDamageScale[$DamageType::Default] = 1.0;
   shieldDamageScale[$DamageType::Impact] = 1.25;
   shieldDamageScale[$DamageType::Ground] = 1.0;
   shieldDamageScale[$DamageType::Explosion] = 2.0;
   shieldDamageScale[$DamageType::Lightning]	= 5.0;

   damageScale[$DamageType::Blaster] = 1.0;
   damageScale[$DamageType::Bullet] = 1.0;
   damageScale[$DamageType::ELF] = 0.0;
   damageScale[$DamageType::ShockLance] = 1.0;
   damageScale[$DamageType::Laser] = 1.0;
   damageScale[$DamageType::ShrikeBlaster] = 2.0;
   damageScale[$DamageType::BellyTurret] = 1.2;
   damageScale[$DamageType::AATurret] = 1.0;
   damageScale[$DamageType::IndoorDepTurret] = 1.0;
   damageScale[$DamageType::OutdoorDepTurret] = 1.0;
   damageScale[$DamageType::SentryTurret] = 1.0;
   damageScale[$DamageType::Disc] = 1.15;
   damageScale[$DamageType::Grenade] = 1.2;
   damageScale[$DamageType::Mine] = 2.0;
   damageScale[$DamageType::Missile] = 2.0;
   damageScale[$DamageType::Mortar] = 2.0;
   damageScale[$DamageType::Plasma] = 1.25;
   damageScale[$DamageType::BomberBombs] = 1.0;
   damageScale[$DamageType::TankChaingun] = 1.0;
   damageScale[$DamageType::TankMortar] = 2.0;
   damageScale[$DamageType::MissileTurret] = 2.0;
   damageScale[$DamageType::MortarTurret] = 2.0;
   damageScale[$DamageType::PlasmaTurret] = 2.0;
   damageScale[$DamageType::SatchelCharge] = 4.0;
   damageScale[$DamageType::Default] = 1.0;
   damageScale[$DamageType::Impact] = 1.25;
   damageScale[$DamageType::Ground] = 1.0;
   damageScale[$DamageType::Explosion] = 1.0;
   damageScale[$DamageType::Lightning]	= 5.0;
};

//----------------------------------------------------------------------------
// PLAYER DAMAGE PROFILES
//----------------------------------------------------------------------------

datablock SimDataBlock(LightPlayerDamageProfile)
{
   damageScale[$DamageType::Blaster] =			1.3;
   damageScale[$DamageType::Bullet] =		 	1.2;
   damageScale[$DamageType::ELF] =		 		0.75;
   damageScale[$DamageType::ShockLance] =		1.0;
   damageScale[$DamageType::Laser] =		 	1.12;
   damageScale[$DamageType::ShrikeBlaster] =	1.10;
   damageScale[$DamageType::BellyTurret] =		1.0;
   damageScale[$DamageType::AATurret] =		 	0.7;
   damageScale[$DamageType::IndoorDepTurret] =	1.3;
   damageScale[$DamageType::OutdoorDepTurret] =	1.3;
   damageScale[$DamageType::SentryTurret] =		1.0;
   damageScale[$DamageType::Disc] =		 		1.0;
   damageScale[$DamageType::Grenade] =		 	1.2;
   damageScale[$DamageType::Mine] =		 		1.0;
   damageScale[$DamageType::Missile] =		 	1.0;
   damageScale[$DamageType::Mortar] =		 	1.3;
   damageScale[$DamageType::Plasma] =		 	1.0;
   damageScale[$DamageType::BomberBombs] =		3.0;
   damageScale[$DamageType::TankChaingun] =		1.7;
   damageScale[$DamageType::TankMortar] =		1.0;
   damageScale[$DamageType::MissileTurret] =	1.0;
   damageScale[$DamageType::MortarTurret] =		1.3;
   damageScale[$DamageType::PlasmaTurret] =		1.0;
   damageScale[$DamageType::SatchelCharge] =	3.0;
   damageScale[$DamageType::Default] =			1.0;
   damageScale[$DamageType::Impact] =			1.2;
   damageScale[$DamageType::Ground] =			1.0;
   damageScale[$DamageType::Explosion] =		1.0;
   damageScale[$DamageType::Lightning]	=		1.0;
};

datablock SimDataBlock(MediumPlayerDamageProfile)
{
   damageScale[$DamageType::Blaster] =		 	1.0;
   damageScale[$DamageType::Bullet] =		 	1.0;
   damageScale[$DamageType::ELF] =		 		0.75;
   damageScale[$DamageType::ShockLance] =		1.0;
   damageScale[$DamageType::Laser] =			1.1;
   damageScale[$DamageType::ShrikeBlaster] =	1.0;
   damageScale[$DamageType::BellyTurret] =		1.0;
   damageScale[$DamageType::AATurret] =			0.7;
   damageScale[$DamageType::IndoorDepTurret] =	1.0;
   damageScale[$DamageType::OutdoorDepTurret] =	1.0;
   damageScale[$DamageType::SentryTurret] =		1.0;
   damageScale[$DamageType::Disc] =		 		0.8;
   damageScale[$DamageType::Grenade] =		 	1.0;
   damageScale[$DamageType::Mine] =		 		0.9;
   damageScale[$DamageType::Missile] =		 	0.8;
   damageScale[$DamageType::Mortar] =		 	1.0;
   damageScale[$DamageType::Plasma] =		 	0.65;
   damageScale[$DamageType::BomberBombs] =		3.0;
   damageScale[$DamageType::TankChaingun] =		1.5;
   damageScale[$DamageType::TankMortar] =		0.85;
   damageScale[$DamageType::MissileTurret] =	0.8;
   damageScale[$DamageType::MortarTurret] =		1.0;
   damageScale[$DamageType::PlasmaTurret] =		0.65;
   damageScale[$DamageType::SatchelCharge] =	3.0;
   damageScale[$DamageType::Default] =		 	1.0;
   damageScale[$DamageType::Impact] =		 	1.0;
   damageScale[$DamageType::Ground] =		 	1.0;
   damageScale[$DamageType::Explosion] =		0.8;
   damageScale[$DamageType::Lightning]	=		1.2;
};

datablock SimDataBlock(HeavyPlayerDamageProfile)
{
   damageScale[$DamageType::Blaster] =		 	0.7;
   damageScale[$DamageType::Bullet] =		 	0.6;
   damageScale[$DamageType::ELF] =		 		0.75;
   damageScale[$DamageType::ShockLance] =		1.0;
   damageScale[$DamageType::Laser] =		 	0.67;
   damageScale[$DamageType::ShrikeBlaster] =	0.8;
   damageScale[$DamageType::BellyTurret] =		0.8;
   damageScale[$DamageType::AATurret] =		 	0.6;
   damageScale[$DamageType::IndoorDepTurret] =	0.7;
   damageScale[$DamageType::OutdoorDepTurret] =	0.7;
   damageScale[$DamageType::SentryTurret] =		1.0;
   damageScale[$DamageType::Disc] =		 		0.6;
   damageScale[$DamageType::Grenade] =		 	0.8;
   damageScale[$DamageType::Mine] =		 		0.8;
   damageScale[$DamageType::Missile] =			0.6;
   damageScale[$DamageType::Mortar] =			0.7;
   damageScale[$DamageType::Plasma] =			0.4;
   damageScale[$DamageType::BomberBombs] =		3.0;
   damageScale[$DamageType::TankChaingun] =		1.3;
   damageScale[$DamageType::TankMortar] =		0.7;
   damageScale[$DamageType::MissileTurret] =	0.6;
   damageScale[$DamageType::MortarTurret] =		0.6;
   damageScale[$DamageType::PlasmaTurret] =		0.4;
   damageScale[$DamageType::SatchelCharge] =	3.0;
   damageScale[$DamageType::Default] =		 	1.0;
   damageScale[$DamageType::Impact] =		 	0.8;
   damageScale[$DamageType::Ground] =		 	1.0;
   damageScale[$DamageType::Explosion] =		0.6;
   damageScale[$DamageType::Lightning]	=		1.4;
};
