

/////////////////////////////////////////////////////////////////////////////////////////////////
// %1 = Victim's name                                                                          //
// %2 = Victim's gender (value will be either "him" or "her")                                  //
// %3 = Victim's possessive gender	(value will be either "his" or "her")                      //
// %4 = Killer's name                                                                          //
// %5 = Killer's gender (value will be either "him" or "her")                                  //
// %6 = Killer's possessive gender (value will be either "his" or "her")                       //
// %7 = implement that killed the victim (value is the object number of the bullet, disc, etc) //
/////////////////////////////////////////////////////////////////////////////////////////////////

$DeathMessageCampingCount = 1;
$DeathMessageCamping[0] = '\c0%1 was killed for camping near the Nexus.';
																						   
 //Out of Bounds deaths
$DeathMessageOOBCount = 1;
$DeathMessageOOB[0] = '\c0%1 was killed for loitering outside the mission area.';

$DeathMessageLavaCount = 4;
$DeathMessageLava[0] = '\c0%1\'s last thought before falling into the lava : \'Oops\'.';
$DeathMessageLava[1] = '\c0%1 makes the supreme sacrifice to the lava gods.';
$DeathMessageLava[2] = '\c0%1 looks surprised by the lava - but only briefly.';
$DeathMessageLava[3] = '\c0%1 wimps out by jumping into the lava and trying to make it look like an accident.'; 

$DeathMessageLightningCount = 3;
$DeathMessageLightning[0] = '\c0%1 was killed by lightning!';
$DeathMessageLightning[1] = '\c0%1 caught a lightning bolt!';
$DeathMessageLightning[2] = '\c0%1 stuck %3 finger in Mother Nature\'s light socket.';

//these used when a player presses ctrl-k
$DeathMessageSuicideCount = 5;
$DeathMessageSuicide[0] = '\c0%1 blows %3 own head off!';  
$DeathMessageSuicide[1] = '\c0%1 ends it all. Cue violin music.';
$DeathMessageSuicide[2] = '\c0%1 kills %2self.';
$DeathMessageSuicide[3] = '\c0%1 goes for the quick and dirty respawn.';
$DeathMessageSuicide[4] = '\c0%1 self-destructs in a fit of ennui.';

$DeathMessageVehPadCount = 1;
$DeathMessageVehPad[0] = '\c0%1 got caught in a vehicle\'s spawn field.'; 

$DeathMessageFFPowerupCount = 1;
$DeathMessageFFPowerup[0] = '\c0%1 got caught up in a forcefield during power up.'; 

$DeathMessageRogueMineCount = 1;
$DeathMessageRogueMine[$DamageType::Mine, 0] = '\c0%1 is all mine.';

//these used when a player kills himself (other than by using ctrl - k)
$DeathMessageSelfKillCount = 5;
$DeathMessageSelfKill[$DamageType::Blaster, 0] = '\c0%1 kills %2self with a blaster.';	
$DeathMessageSelfKill[$DamageType::Blaster, 1] = '\c0%1 makes a note to watch out for blaster ricochets.';
$DeathMessageSelfKill[$DamageType::Blaster, 2] = '\c0%1\'s blaster kills its hapless owner.';
$DeathMessageSelfKill[$DamageType::Blaster, 3] = '\c0%1 deftly guns %2self down with %3 own blaster.';
$DeathMessageSelfKill[$DamageType::Blaster, 4] = '\c0%1 has a fatal encounter with %3 own blaster.';

$DeathMessageSelfKill[$DamageType::Plasma, 0] = '\c0%1 kills %2self with plasma.';
$DeathMessageSelfKill[$DamageType::Plasma, 1] = '\c0%1 turns %2self into plasma-charred briquettes.';
$DeathMessageSelfKill[$DamageType::Plasma, 2] = '\c0%1 swallows a white-hot mouthful of %3 own plasma.';
$DeathMessageSelfKill[$DamageType::Plasma, 3] = '\c0%1 immolates %2self.';
$DeathMessageSelfKill[$DamageType::Plasma, 4] = '\c0%1 experiences the joy of cooking %2self.';

$DeathMessageSelfKill[$DamageType::Disc, 0] = '\c0%1 kills %2self with a disc.';
$DeathMessageSelfKill[$DamageType::Disc, 1] = '\c0%1 catches %3 own spinfusor disc.';
$DeathMessageSelfKill[$DamageType::Disc, 2] = '\c0%1 heroically falls on %3 own disc.';
$DeathMessageSelfKill[$DamageType::Disc, 3] = '\c0%1 helpfully jumps into %3 own disc\'s explosion.';
$DeathMessageSelfKill[$DamageType::Disc, 4] = '\c0%1 plays Russian roulette with %3 spinfusor.';

$DeathMessageSelfKill[$DamageType::Grenade, 0] = '\c0%1 destroys %2self with a grenade!';   //applies to hand grenades *and* grenade launcher grenades
$DeathMessageSelfKill[$DamageType::Grenade, 1] = '\c0%1 took a bad bounce from %3 own grenade!';
$DeathMessageSelfKill[$DamageType::Grenade, 2] = '\c0%1 pulled the pin a shade early.';
$DeathMessageSelfKill[$DamageType::Grenade, 3] = '\c0%1\'s own grenade turns on %2.';
$DeathMessageSelfKill[$DamageType::Grenade, 4] = '\c0%1 blows %2self up real good.';

$DeathMessageSelfKill[$DamageType::Mortar, 0] = '\c0%1 kills %2self with a mortar!';
$DeathMessageSelfKill[$DamageType::Mortar, 1] = '\c0%1 hugs %3 own big green boomie.';
$DeathMessageSelfKill[$DamageType::Mortar, 2] = '\c0%1 mortars %2self all over the map.';
$DeathMessageSelfKill[$DamageType::Mortar, 3] = '\c0%1 experiences %3 mortar\'s payload up close.';
$DeathMessageSelfKill[$DamageType::Mortar, 4] = '\c0%1 suffered the wrath of %3 own mortar.';

$DeathMessageSelfKill[$DamageType::Missile, 0] = '\c0%1 kills %2self with a missile!';
$DeathMessageSelfKill[$DamageType::Missile, 1] = '\c0%1 runs a missile up %3 own tailpipe.';
$DeathMessageSelfKill[$DamageType::Missile, 2] = '\c0%1 tests the missile\'s shaped charge on %2self.';
$DeathMessageSelfKill[$DamageType::Missile, 3] = '\c0%1 achieved missile lock on %2self.';
$DeathMessageSelfKill[$DamageType::Missile, 4] = '\c0%1 gracefully smoked %2self with a missile!';

$DeathMessageSelfKill[$DamageType::Mine, 0] = '\c0%1 kills %2self with a mine!';
$DeathMessageSelfKill[$DamageType::Mine, 1] = '\c0%1\'s mine violently reminds %2 of its existence.';
$DeathMessageSelfKill[$DamageType::Mine, 2] = '\c0%1 plants a decisive foot on %3 own mine!';
$DeathMessageSelfKill[$DamageType::Mine, 3] = '\c0%1 fatally trips on %3 own mine!';
$DeathMessageSelfKill[$DamageType::Mine, 4] = '\c0%1 makes a note not to run over %3 own mines.';

$DeathMessageSelfKill[$DamageType::SatchelCharge, 0] = '\c0%1 goes out with a bang!';  //applies to most explosion types
$DeathMessageSelfKill[$DamageType::SatchelCharge, 1] = '\c0%1 fall down...go boom.';
$DeathMessageSelfKill[$DamageType::SatchelCharge, 2] = '\c0%1 explodes in that fatal kind of way.';
$DeathMessageSelfKill[$DamageType::SatchelCharge, 3] = '\c0%1 experiences explosive decompression!';
$DeathMessageSelfKill[$DamageType::SatchelCharge, 4] = '\c0%1 splashes all over the map.';

$DeathMessageSelfKill[$DamageType::Ground, 0] = '\c0%1 lands too hard.';
$DeathMessageSelfKill[$DamageType::Ground, 1] = '\c0%1 finds gravity unforgiving.';
$DeathMessageSelfKill[$DamageType::Ground, 2] = '\c0%1 craters on impact.';
$DeathMessageSelfKill[$DamageType::Ground, 3] = '\c0%1 pancakes upon landing.';
$DeathMessageSelfKill[$DamageType::Ground, 4] = '\c0%1 loses a game of chicken with the ground.';


//used when a player is killed by a teammate 
$DeathMessageTeamKillCount = 1;	
$DeathMessageTeamKill[$DamageType::Blaster, 0] = '\c0%4 TEAMKILLED %1 with a blaster!';
$DeathMessageTeamKill[$DamageType::Plasma, 0] = '\c0%4 TEAMKILLED %1 with a plasma rifle!';
$DeathMessageTeamKill[$DamageType::Bullet, 0] = '\c0%4 TEAMKILLED %1 with a chaingun!';
$DeathMessageTeamKill[$DamageType::Disc, 0] = '\c0%4 TEAMKILLED %1 with a spinfusor!';
$DeathMessageTeamKill[$DamageType::Grenade, 0] = '\c0%4 TEAMKILLED %1 with a grenade!';
$DeathMessageTeamKill[$DamageType::Laser, 0] = '\c0%4 TEAMKILLED %1 with a laser rifle!';
$DeathMessageTeamKill[$DamageType::Elf, 0] = '\c0%4 TEAMKILLED %1 with an ELF projector!';
$DeathMessageTeamKill[$DamageType::Mortar, 0] = '\c0%4 TEAMKILLED %1 with a mortar!';
$DeathMessageTeamKill[$DamageType::Missile, 0] = '\c0%4 TEAMKILLED %1 with a missile!';
$DeathMessageTeamKill[$DamageType::Shocklance, 0] = '\c0%4 TEAMKILLED %1 with a shocklance!';
$DeathMessageTeamKill[$DamageType::Mine, 0] = '\c0%4 TEAMKILLED %1 with a mine!';
$DeathMessageTeamKill[$DamageType::SatchelCharge, 0] = '\c0%4 blew up TEAMMATE %1!';
$DeathMessageTeamKill[$DamageType::Impact, 0] = '\c0%4 runs down TEAMMATE %1!';



//these used when a player is killed by an enemy
$DeathMessageCount = 5;
$DeathMessage[$DamageType::Blaster, 0] = '\c0%4 kills %1 with a blaster.';
$DeathMessage[$DamageType::Blaster, 1] = '\c0%4 pings %1 to death.';
$DeathMessage[$DamageType::Blaster, 2] = '\c0%1 gets a pointer in blaster use from %4.';
$DeathMessage[$DamageType::Blaster, 3] = '\c0%4 fatally embarrasses %1 with %6 pea shooter.';
$DeathMessage[$DamageType::Blaster, 4] = '\c0%4 unleashes a terminal blaster barrage into %1.';

$DeathMessage[$DamageType::Plasma, 0] = '\c0%4 roasts %1 with the plasma rifle.';
$DeathMessage[$DamageType::Plasma, 1] = '\c0%4 gooses %1 with an extra-friendly burst of plasma.';
$DeathMessage[$DamageType::Plasma, 2] = '\c0%4 entices %1 to try a faceful of plasma.';
$DeathMessage[$DamageType::Plasma, 3] = '\c0%4 introduces %1 to the plasma immolation dance.';
$DeathMessage[$DamageType::Plasma, 4] = '\c0%4 slaps The Hot Kiss of Death on %1.';

$DeathMessage[$DamageType::Bullet, 0] = '\c0%4 rips %1 up with the chaingun.';
$DeathMessage[$DamageType::Bullet, 1] = '\c0%4 happily chews %1 into pieces with %6 chaingun.';
$DeathMessage[$DamageType::Bullet, 2] = '\c0%4 administers a dose of Vitamin Lead to %1.';
$DeathMessage[$DamageType::Bullet, 3] = '\c0%1 suffers a serious hosing from %4\'s chaingun.';
$DeathMessage[$DamageType::Bullet, 4] = '\c0%4 bestows the blessings of %6 chaingun on %1.';

$DeathMessage[$DamageType::Disc, 0] = '\c0%4 demolishes %1 with the spinfusor.';
$DeathMessage[$DamageType::Disc, 1] = '\c0%4 serves %1 a blue plate special.';
$DeathMessage[$DamageType::Disc, 2] = '\c0%4 shares a little blue friend with %1.';
$DeathMessage[$DamageType::Disc, 3] = '\c0%4 puts a little spin into %1.';
$DeathMessage[$DamageType::Disc, 4] = '\c0%1 becomes one of %4\'s greatest hits.';

$DeathMessage[$DamageType::Grenade, 0] = '\c0%4 eliminates %1 with a grenade.';   //applies to hand grenades *and* grenade launcher grenades
$DeathMessage[$DamageType::Grenade, 1] = '\c0%4 blows up %1 real good!';
$DeathMessage[$DamageType::Grenade, 2] = '\c0%1 gets annihilated by %4\'s grenade.';
$DeathMessage[$DamageType::Grenade, 3] = '\c0%1 receives a kaboom lesson from %4.';
$DeathMessage[$DamageType::Grenade, 4] = '\c0%4 turns %1 into grenade salad.'; 

$DeathMessage[$DamageType::Laser, 0] = '\c0%1 becomes %4\'s latest pincushion.';
$DeathMessage[$DamageType::Laser, 1] = '\c0%4 picks off %1 with %6 laser rifle.';
$DeathMessage[$DamageType::Laser, 2] = '\c0%4 uses %1 as the targeting dummy in a sniping demonstration.';						
$DeathMessage[$DamageType::Laser, 3] = '\c0%4 pokes a shiny new hole in %1 with %6 laser rifle.';
$DeathMessage[$DamageType::Laser, 4] = '\c0%4 caresses %1 with a couple hundred megajoules of laser.';

$DeathMessage[$DamageType::Elf, 0] = '\c0%4 fries %1 with the ELF projector.';
$DeathMessage[$DamageType::Elf, 1] = '\c0%4 bug zaps %1 with %6 ELF.';
$DeathMessage[$DamageType::Elf, 2] = '\c0%1 learns the shocking truth about %4\'s ELF skills.';
$DeathMessage[$DamageType::Elf, 3] = '\c0%4 electrocutes %1 without a sponge.';
$DeathMessage[$DamageType::Elf, 4] = '\c0%4\'s ELF projector leaves %1 a crispy critter.';

$DeathMessage[$DamageType::Mortar, 0] = '\c0%4 obliterates %1 with the mortar.';
$DeathMessage[$DamageType::Mortar, 1] = '\c0%4 drops a mortar round right in %1\'s lap.';
$DeathMessage[$DamageType::Mortar, 2] = '\c0%4 delivers a mortar payload straight to %1.';
$DeathMessage[$DamageType::Mortar, 3] = '\c0%4 offers a little "heavy love" to %1.';
$DeathMessage[$DamageType::Mortar, 4] = '\c0%1 stumbles into %4\'s mortar reticle.';

$DeathMessage[$DamageType::Missile, 0] = '\c0%4 intercepts %1 with a missile.';
$DeathMessage[$DamageType::Missile, 1] = '\c0%4 watches %6 missile touch %1 and go boom.';
$DeathMessage[$DamageType::Missile, 2] = '\c0%4 got sweet tone on %1.';
$DeathMessage[$DamageType::Missile, 3] = '\c0By now, %1 has realized %4\'s missile killed %2.';
$DeathMessage[$DamageType::Missile, 4] = '\c0%4\'s missile rains little pieces of %1 all over the ground.';

$DeathMessage[$DamageType::Shocklance, 0] = '\c0%4 reaps a harvest of %1 with the shocklance.';
$DeathMessage[$DamageType::Shocklance, 1] = '\c0%4 feeds %1 the business end of %6 shocklance.';
$DeathMessage[$DamageType::Shocklance, 2] = '\c0%4 stops %1 dead with the shocklance.';
$DeathMessage[$DamageType::Shocklance, 3] = '\c0%4 eliminates %1 in close combat.';
$DeathMessage[$DamageType::Shocklance, 4] = '\c0%4 ruins %1\'s day with one zap of a shocklance.';

$DeathMessage[$DamageType::Mine, 0] = '\c0%4 kills %1 with a mine.';
$DeathMessage[$DamageType::Mine, 1] = '\c0%1 doesn\'t see %4\'s mine in time.';
$DeathMessage[$DamageType::Mine, 2] = '\c0%4 gets a sapper kill on %1.';
$DeathMessage[$DamageType::Mine, 3] = '\c0%1 puts his foot on %4\'s mine.';
$DeathMessage[$DamageType::Mine, 4] = '\c0One small step for %1, one giant mine kill for %4.';

$DeathMessage[$DamageType::SatchelCharge, 0] = '\c0%4 buys %1 a ticket to the moon.';  //satchel charge only
$DeathMessage[$DamageType::SatchelCharge, 1] = '\c0%4 blows %1 into low orbit.';
$DeathMessage[$DamageType::SatchelCharge, 2] = '\c0%4 makes %1 a hugely explosive offer.';
$DeathMessage[$DamageType::SatchelCharge, 3] = '\c0%4 turns %1 into a cloud of satchel-vaporized armor.';
$DeathMessage[$DamageType::SatchelCharge, 4] = '\c0%4\'s satchel charge leaves %1 nothin\' but smokin\' boots.';

$DeathMessageHeadshotCount = 3;
$DeathMessageHeadshot[$DamageType::Laser, 0] = '\c0%4 drills right through %1\'s braincase with %6 laser.';
$DeathMessageHeadshot[$DamageType::Laser, 1] = '\c0%4 pops %1\'s head like a cheap balloon.';
$DeathMessageHeadshot[$DamageType::Laser, 2] = '\c0%1 loses %3 head over %4\'s laser skill.';

 
//These used when a player is run over by a vehicle
$DeathMessageVehicleCount = 5;
$DeathMessageVehicle[0] = '\c0%4 runs down %1.';
$DeathMessageVehicle[1] = '\c0%1 acquires that run-down feeling from %4.';
$DeathMessageVehicle[2] = '\c0%4 transforms %1 into tribal roadkill.';
$DeathMessageVehicle[3] = '\c0%1 makes a painfully close examination of %4\'s front bumper.';
$DeathMessageVehicle[4] = '\c0%1\'s messy death leaves a mark on %4\'s vehicle finish.';

$DeathMessageVehicleCrashCount = 5;
$DeathMessageVehicleCrash[ $DamageType::Crash, 0 ] = '\c0%1 fails to eject in time.';
$DeathMessageVehicleCrash[ $DamageType::Crash, 1 ] = '\c0%1 becomes one with his vehicle dashboard.';
$DeathMessageVehicleCrash[ $DamageType::Crash, 2 ] = '\c0%1 drives under the influence of death.';
$DeathMessageVehicleCrash[ $DamageType::Crash, 3 ] = '\c0%1 makes a perfect three hundred point landing.';
$DeathMessageVehicleCrash[ $DamageType::Crash, 4 ] = '\c0%1 heroically pilots his vehicle into something really, really hard.';

$DeathMessageVehicleFriendlyCount = 3;
$DeathMessageVehicleFriendly[0] = '\c0%1 gets in the way of a friendly vehicle.';
$DeathMessageVehicleFriendly[1] = '\c0Sadly, a friendly vehicle turns %1 into roadkill.';
$DeathMessageVehicleFriendly[2] = '\c0%1 becomes an unsightly ornament on a team vehicle\'s hood.';

$DeathMessageVehicleUnmannedCount = 3;
$DeathMessageVehicleUnmanned[0] = '\c0%1 gets in the way of a runaway vehicle.';
$DeathMessageVehicleUnmanned[1] = '\c0An unmanned vehicle kills the pathetic %1.';
$DeathMessageVehicleUnmanned[2] = '\c0%1 is struck down by an empty vehicle.';

//These used when a player is killed by a nearby equipment explosion
$DeathMessageExplosionCount = 3;
$DeathMessageExplosion[0] = '\c0%1 was killed by exploding equipment!';
$DeathMessageExplosion[1] = '\c0%1 stood a little too close to the action!';
$DeathMessageExplosion[2] = '\c0%1 learns how to be collateral damage.';

//These used when an automated turret kills an  enemy player
$DeathMessageTurretKillCount = 3;
$DeathMessageTurretKill[$DamageType::PlasmaTurret, 0] = '\c0%1 is killed by a plasma turret.';
$DeathMessageTurretKill[$DamageType::PlasmaTurret, 1] = '\c0%1\'s body now marks the location of a plasma turret.';
$DeathMessageTurretKill[$DamageType::PlasmaTurret, 2] = '\c0%1 is fried by a plasma turret.';

$DeathMessageTurretKill[$DamageType::AATurret, 0] = '\c0%1 is killed by an AA turret.';
$DeathMessageTurretKill[$DamageType::AATurret, 1] = '\c0%1 is shot down by an AA turret.';
$DeathMessageTurretKill[$DamageType::AATurret, 2] = '\c0%1 takes fatal flak from an AA turret.';

$DeathMessageTurretKill[$DamageType::ElfTurret, 0] = '\c0%1 is killed by an ELF turret.';
$DeathMessageTurretKill[$DamageType::ElfTurret, 1] = '\c0%1 is zapped by an ELF turret.';
$DeathMessageTurretKill[$DamageType::ElfTurret, 2] = '\c0%1 is short-circuited by an ELF turret.';

$DeathMessageTurretKill[$DamageType::MortarTurret, 0] = '\c0%1 is killed by a mortar turret.';
$DeathMessageTurretKill[$DamageType::MortarTurret, 1] = '\c0%1 enjoys a mortar turret\'s attention.';
$DeathMessageTurretKill[$DamageType::MortarTurret, 2] = '\c0%1 is blown to kibble by a mortar turret.';

$DeathMessageTurretKill[$DamageType::MissileTurret, 0] = '\c0%1 is killed by a missile turret.';
$DeathMessageTurretKill[$DamageType::MissileTurret, 1] = '\c0%1 is shot down by a missile turret.';
$DeathMessageTurretKill[$DamageType::MissileTurret, 2] = '\c0%1 is blown away by a missile turret.';

$DeathMessageTurretKill[$DamageType::IndoorDepTurret, 0] = '\c0%1 is killed by a clamp turret.';
$DeathMessageTurretKill[$DamageType::IndoorDepTurret, 1] = '\c0%1 gets burned by a clamp turret.';
$DeathMessageTurretKill[$DamageType::IndoorDepTurret, 2] = '\c0A clamp turret eliminates %1.';

$DeathMessageTurretKill[$DamageType::OutdoorDepTurret, 0] = '\c0A spike turret neatly drills %1.';
$DeathMessageTurretKill[$DamageType::OutdoorDepTurret, 1] = '\c0%1 gets taken out by a spike turret.';
$DeathMessageTurretKill[$DamageType::OutdoorDepTurret, 2] = '\c0%1 dies under a spike turret\'s love.';

$DeathMessageTurretKill[$DamageType::SentryTurret, 0] = '\c0%1 didn\'t see that Sentry turret, but it saw %2...';
$DeathMessageTurretKill[$DamageType::SentryTurret, 1] = '\c0%1 needs to watch for Sentry turrets.';
$DeathMessageTurretKill[$DamageType::SentryTurret, 2] = '\c0%1 now understands how Sentry turrets work.';


//used when a player is killed by a teammate controlling a turret
$DeathMessageCTurretTeamKillCount = 1;	
$DeathMessageCTurretTeamKill[$DamageType::PlasmaTurret, 0] = '\c0%4 TEAMKILLED %1 with a plasma turret!';

$DeathMessageCTurretTeamKill[$DamageType::AATurret, 0] = '\c0%4 TEAMKILLED %1 with an AA turret!';

$DeathMessageCTurretTeamKill[$DamageType::ELFTurret, 0] = '\c0%4 TEAMKILLED %1 with an ELF turret!';

$DeathMessageCTurretTeamKill[$DamageType::MortarTurret, 0] = '\c0%4 TEAMKILLED %1 with a mortar turret!';

$DeathMessageCTurretTeamKill[$DamageType::MissileTurret, 0] = '\c0%4 TEAMKILLED %1 with a missile turret!';

$DeathMessageCTurretTeamKill[$DamageType::IndoorDepTurret, 0] = '\c0%4 TEAMKILLED %1 with a clamp turret!';

$DeathMessageCTurretTeamKill[$DamageType::OutdoorDepTurret, 0] = '\c0%4 TEAMKILLED %1 with a spike turret!';

$DeathMessageCTurretTeamKill[$DamageType::SentryTurret, 0] = '\c0%4 TEAMKILLED %1 with a sentry turret!';

$DeathMessageCTurretTeamKill[$DamageType::BomberBombs, 0] = '\c0%4 TEAMKILLED %1 in a bombastic explosion of raining death.';

$DeathMessageCTurretTeamKill[$DamageType::BellyTurret, 0] = '\c0%4 TEAMKILLED %1 by annihilating him from a belly turret.';

$DeathMessageCTurretTeamKill[$DamageType::TankChainGun, 0] = '\c0%4 TEAMKILLED %1 with his tank\'s chaingun.';

$DeathMessageCTurretTeamKill[$DamageType::TankMortar, 0] = '\c0%4 TEAMKILLED %1 by lobbing the BIG green death from a tank.'; 

$DeathMessageCTurretTeamKill[$DamageType::ShrikeBlaster, 0] = '\c0%4 TEAMKILLED %1 by strafing from a Shrike.';

$DeathMessageCTurretTeamKill[$DamageType::MPBMissile, 0] = '\c0%4 TEAMKILLED %1 when the MPB locked onto him.';

 

//used when a player is killed by an uncontrolled, friendly turret
$DeathMessageCTurretAccdtlKillCount = 1; 
$DeathMessageCTurretAccdtlKill[$DamageType::PlasmaTurret, 0] = '\c0%1 got in the way of a plasma turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::AATurret, 0] = '\c0%1 got in the way of an AA turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::ELFTurret, 0] = '\c0%1 got in the way of an ELF turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::MortarTurret, 0] = '\c0%1 got in the way of a mortar turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::MissileTurret, 0] = '\c0%1 got in the way of a missile turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::IndoorDepTurret, 0] = '\c0%1 got in the way of a clamp turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::OutdoorDepTurret, 0] = '\c0%1 got in the way of a spike turret!';

$DeathMessageCTurretAccdtlKill[$DamageType::SentryTurret, 0] = '\c0%1 got in the way of a Sentry turret!';


//these messages for owned or controlled turrets
$DeathMessageCTurretKillCount = 3;
$DeathMessageCTurretKill[$DamageType::PlasmaTurret, 0] = '\c0%4 torches %1 with a plasma turret!'; 
$DeathMessageCTurretKill[$DamageType::PlasmaTurret, 1] = '\c0%4 fries %1 with a plasma turret!';
$DeathMessageCTurretKill[$DamageType::PlasmaTurret, 2] = '\c0%4 lights up %1 with a plasma turret!';

$DeathMessageCTurretKill[$DamageType::AATurret, 0] = '\c0%4 shoots down %1 with an AA turret.';
$DeathMessageCTurretKill[$DamageType::AATurret, 1] = '\c0%1 gets shot down by %1\'s AA turret.';
$DeathMessageCTurretKill[$DamageType::AATurret, 2] = '\c0%4 takes out %1 with an AA turret.';

$DeathMessageCTurretKill[$DamageType::ElfTurret, 0] = '\c0%1 gets zapped by ELF gunner %4.';
$DeathMessageCTurretKill[$DamageType::ElfTurret, 1] = '\c0%1 gets barbecued by ELF gunner %4.';
$DeathMessageCTurretKill[$DamageType::ElfTurret, 2] = '\c0%1 gets shocked by ELF gunner %4.';

$DeathMessageCTurretKill[$DamageType::MortarTurret, 0] = '\c0%1 is annihilated by %4\'s mortar turret.';
$DeathMessageCTurretKill[$DamageType::MortarTurret, 1] = '\c0%1 is blown away by %4\'s mortar turret.';
$DeathMessageCTurretKill[$DamageType::MortarTurret, 2] = '\c0%1 is pureed by %4\'s mortar turret.';

$DeathMessageCTurretKill[$DamageType::MissileTurret, 0] = '\c0%4 shows %1 a new world of pain with a missile turret.';
$DeathMessageCTurretKill[$DamageType::MissileTurret, 1] = '\c0%4 pops %1 with a missile turret.';
$DeathMessageCTurretKill[$DamageType::MissileTurret, 2] = '\c0%4\'s missile turret lights up %1\'s, uh, ex-life.';

$DeathMessageCTurretKill[$DamageType::IndoorDepTurret, 0] = '\c0%1 is chewed up and spat out by %4\'s clamp turret.';
$DeathMessageCTurretKill[$DamageType::IndoorDepTurret, 1] = '\c0%1 is knocked out by %4\'s clamp turret.';
$DeathMessageCTurretKill[$DamageType::IndoorDepTurret, 2] = '\c0%4\'s clamp turret drills %1 nicely.';

$DeathMessageCTurretKill[$DamageType::OutdoorDepTurret, 0] = '\c0%1 is chewed up by %4\'s spike turret.';
$DeathMessageCTurretKill[$DamageType::OutdoorDepTurret, 1] = '\c0%1 feels the burn from %4\'s spike turret.';
$DeathMessageCTurretKill[$DamageType::OutdoorDepTurret, 2] = '\c0%1 is nailed by %4\'s spike turret.';

$DeathMessageCTurretKill[$DamageType::SentryTurret, 0] = '\c0%4 caught %1 by surprise with a turret.';
$DeathMessageCTurretKill[$DamageType::SentryTurret, 1] = '\c0%4\'s turret took out %1.';
$DeathMessageCTurretKill[$DamageType::SentryTurret, 2] = '\c0%4 blasted %1 with a turret.';

$DeathMessageCTurretKill[$DamageType::BomberBombs, 0] = '\c0%1 catches %4\'s bomb in both teeth.'; 
$DeathMessageCTurretKill[$DamageType::BomberBombs, 1] = '\c0%4 leaves %1 a smoking bomb crater.'; 
$DeathMessageCTurretKill[$DamageType::BomberBombs, 2] = '\c0%4 bombs %1 back to the 20th century.';

$DeathMessageCTurretKill[$DamageType::BellyTurret, 0] = '\c0%1 eats a big helping of %4\'s belly turret bolt.';
$DeathMessageCTurretKill[$DamageType::BellyTurret, 1] = '\c0%4 plants a belly turret bolt in %1\'s belly.';
$DeathMessageCTurretKill[$DamageType::BellyTurret, 2] = '\c0%1 fails to evade %4\'s deft bomber strafing.';

$DeathMessageCTurretKill[$DamageType::TankChainGun, 0] = '\c0%1 enjoys the rich, metallic taste of %4\'s tank slug.';
$DeathMessageCTurretKill[$DamageType::TankChainGun, 1] = '\c0%4\'s tank chaingun plays sweet music all over %1.';
$DeathMessageCTurretKill[$DamageType::TankChainGun, 2] = '\c0%1 receives a stellar exit wound from %4\'s tank slug.';

$DeathMessageCTurretKill[$DamageType::TankMortar, 0] = '\c0Whoops! %1 + %4\'s tank mortar = Dead %1.';
$DeathMessageCTurretKill[$DamageType::TankMortar, 1] = '\c0%1 learns the happy explosion dance from %4\'s tank mortar.';
$DeathMessageCTurretKill[$DamageType::TankMortar, 2] = '\c0%4\'s tank mortar has a blast with %1.';

$DeathMessageCTurretKill[$DamageType::ShrikeBlaster, 0] = '\c0%1 dines on a Shrike blaster sandwich, courtesy of %4.';
$DeathMessageCTurretKill[$DamageType::ShrikeBlaster, 1] = '\c0The blaster of %4\'s Shrike turns %1 into finely shredded meat.';
$DeathMessageCTurretKill[$DamageType::ShrikeBlaster, 2] = '\c0%1 gets drilled big-time by the blaster of %4\'s Shrike.';

$DeathMessageCTurretKill[$DamageType::MPBMissile, 0] = '\c0%1 intersects nicely with %4\'s MPB Missile.';
$DeathMessageCTurretKill[$DamageType::MPBMissile, 1] = '\c0%4\'s MPB Missile makes armored chowder out of %1.';
$DeathMessageCTurretKill[$DamageType::MPBMissile, 2] = '\c0%1 has a brief, explosive fling with %4\'s MPB Missile.';

$DeathMessageTurretSelfKillCount = 3;
$DeathMessageTurretSelfKill[0] = '\c0%1 somehow kills %2self with a turret.';
$DeathMessageTurretSelfKill[1] = '\c0%1 apparently didn\'t know the turret was loaded.';
$DeathMessageTurretSelfKill[2] = '\c0%1 helps his team by killing himself with a turret.';



