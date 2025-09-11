function createText(%who)
{
	// The name all enemies have in the training missions
	$EnemyName = "Enemy";
	//Mission Specific wavs, lines and evals
	//=============================================================================
	//Here are all the voice files for the missions
	// the wav variables are the file names for that line
	// text elements are text that appears on the screen
	// and the evals are functions that get called 

	// ANY/Misc
	%who.text[ANY_healthKit, wav] ="voice/Training/Any/ANY.healthkit.wav";
	%who.text[ANY_healthKit, text] ="Press " @ findTrainingControlButtons(useRepairKit) @ " to use your health kit.";
	%who.text[ANY_objComplete01, wav] ="voice/Training/Any/ANY.obj_complete_01.wav";
	%who.text[ANY_objComplete02, wav] ="voice/Training/Any/ANY.obj_complete_02.wav";
	%who.text[ANY_tipNow01, wav] ="voice/Training/Any/ANY.tip_now01.wav";
	%who.text[ANY_tipNow02, wav] ="voice/Training/Any/ANY.tip_now02.wav";
	%who.text[ANY_hunting, wav] ="voice/Training/Any/ANY.hunting.wav";
	%who.text[ANY_kudo01, wav]  ="voice/Training/Any/ANY.kudo01.wav";	
	%who.text[ANY_kudo02, wav]  ="voice/Training/Any/ANY.kudo02.wav";	
	%who.text[ANY_kudo03, wav]  ="voice/Training/Any/ANY.kudo03.wav";	
	%who.text[ANY_kudo04, wav]  ="voice/Training/Any/ANY.kudo04.wav";	
	%who.text[ANY_waypoint01, wav]  ="voice/Training/Any/ANY.waypoint01.wav";	
	%who.text[ANY_waypoint02, wav]  ="voice/Training/Any/ANY.waypoint02.wav";	
	%who.text[ANY_waypoint02, wav]  ="voice/Training/Any/ANY.waypoint02.wav";	
	%who.text[ANY_waypoint03, wav]  ="voice/Training/Any/ANY.waypoint03.wav";	
	%who.text[ANY_prompt01, wav]  ="voice/Training/Any/ANY.prompt01.wav";	
	%who.text[ANY_prompt02, wav]  ="voice/Training/Any/ANY.prompt02.wav";	
	%who.text[ANY_prompt03, wav]  ="=voice/Training/Any/ANY.prompt03.wav";	
	%who.text[ANY_prompt04, wav]  ="voice/Training/Any/ANY.prompt04.wav";	
	%who.text[ANY_prompt05, wav]  ="voice/Training/Any/ANY.prompt05.wav";	
	%who.text[ANY_prompt06, wav]  ="voice/Training/Any/ANY.prompt06.wav";	
	%who.text[ANY_prompt07, wav]  ="voice/Training/Any/ANY.prompt07.wav";	
	%who.text[ANY_warning01, wav]  ="voice/Training/Any/ANY.warning01.wav";	
	%who.text[ANY_warning02, wav]  ="voice/Training/Any/ANY.warning02.wav";	
	%who.text[ANY_warning03, wav]  ="voice/Training/Any/ANY.warning03.wav";	
	%who.text[ANY_warning03, eval]  ="singlePlayerPlayGuiCheck();";	
	%who.text[ANY_warning04, wav]  ="voice/Training/Any/ANY.warning04.wav";	
	%who.text[ANY_warning05, wav]  ="voice/Training/Any/ANY.warning05.wav";	
	%who.text[ANY_warning06, wav]  ="voice/Training/Any/ANY.warning06.wav";	
	%who.text[ANY_alright, wav]  ="voice/Training/Any/ANY.alright.wav";	
	%who.text[ANY_blowoff01, wav]  ="voice/Training/Any/ANY.blowoff01.wav";	
	%who.text[ANY_blowoff02, wav]  ="voice/Training/Any/ANY.blowoff02.wav";	
	%who.text[ANY_blowoff03, wav]  ="voice/Training/Any/ANY.blowoff03.wav";	
	%who.text[ANY_blowoff04, wav]  ="voice/Training/Any/ANY.blowoff04.wav";	
	%who.text[ANY_careful, wav]  ="voice/Training/Any/ANY.careful.wav";	
	%who.text[ANY_good, wav]  ="voice/Training/Any/ANY.good.wav";	
	%who.text[ANY_jingo01, wav]  ="voice/Training/Any/ANY.jingo01.wav";	
	%who.text[ANY_jingo02, wav]  ="voice/Training/Any/ANY.jingo02.wav";	
	%who.text[ANY_jingo03, wav] ="voice/Training/Any/ANY.jingo03.wav";	
	%who.text[ANY_check01, wav]  ="voice/Training/Any/ANY.check01.wav";	
	%who.text[ANY_check02, wav]  ="voice/Training/Any/ANY.check02.wav";	
	%who.text[ANY_abortwarn, wav]  ="voice/Training/Any/ANY.abortwarn.wav";
	%who.text[ANY_abortsoon, wav]  ="voice/Training/Any/ANY.abortsoon.wav";	
	%who.text[ANY_abort, wav]  ="voice/Training/Any/ANY.abort.wav";	
	%who.text[ANY_abort, eval] ="schedule(3000, 0, disconnect);";
	%who.text[ANY_tipskiing, wav] ="voice/Training/Any/ANY.tip.skiing.wav";	
	%who.text[ANY_tipskiing, text] ="Hold down the Jump button ("@findTrainingControlButtons(jump)@") to ski.";
	%who.text[ANY_tipscavenge01, wav]  ="voice/Training/Any/ANY.tip.scavenge01.wav";	
	%who.text[ANY_tipscavenge02, wav] ="voice/Training/Any/ANY.tip.scavenge02.wav";	
	%who.text[ANY_move, wav]  ="voice/Training/Any/ANY.move.wav";	
	%who.text[ANY_practiceSki, wav]  ="voice/Training/Any/ANY.practice.ski.wav";	
	%who.text[ANY_practiceJet, wav]  ="voice/Training/Any/ANY.practice.jet.wav";
	%who.text[ANY_offCourse, wav]  ="voice/Training/Any/ANY.offCourse.wav";
		
	// Mission 1
	%who.text[T1_01, wav] ="voice/Training/Mission1/T1_01.wav";	
	%who.text[T1_01a, wav] ="voice/Training/Mission1/T1_01a.wav";	
	%who.text[T1_01b, wav] ="voice/Training/Mission1/T1_01b.wav";	
	%who.text[T1_01c, wav] ="voice/Training/Mission1/T1_01c.wav";	
	%who.text[T1_02, wav] ="voice/Training/Mission1/T1_02.wav";	
	%who.text[T1_02a, wav]  ="voice/Training/Mission1/T1_02a.wav";	
	%who.text[T1_03, wav]  ="voice/Training/Mission1/T1_03.wav";	
	//%who.text[T1_03, text]  ="Press "@findTrainingControlButtons(toggleHelpGui)@" to toggle HUD help.";	
	//%who.text[T1_03, eval]  ="toggleHelpText();";	
	%who.text[T1_03a, wav]  ="voice/Training/Mission1/T1_03a.wav";	
	%who.text[T1_03a, eval] = "lockArmorHack();autoToggleHelpHud(true);";
	//%who.text[T1_download01, eval] = "serverPlay2d(DownloadingSound);";
	%who.text[T1_download01, text] = "Armor data transfer initiated.";
	%who.text[T1_03b, wav]  ="voice/Training/Mission1/T1_03b.wav";	
	%who.text[T1_03b, text]  ="Use "@findTrainingControlButtons(pageMessageHudUp)@" and "@findTrainingControlButtons(pageMessageHudDown)@" to scroll through the message window.";
	%who.text[T1_03b, eval]  ="flashMessage();";
	%who.text[T1_03c, wav]  ="voice/Training/Mission1/T1_03c.wav";	
	%who.text[T1_03c, eval]  ="flashObjective();";	
	%who.text[T1_03c02, wav]  ="voice/Training/Mission1/T1_03c-02.wav";	
	%who.text[T1_04, wav]  ="voice/Training/Mission1/T1_04.wav";	
	%who.text[T1_04, eval] ="flashCompass();";
	%who.text[T1_05, wav]  ="voice/Training/Mission1/T1_05.wav";	
	%who.text[T1_05, eval] ="flashHealth();";
	%who.text[T1_06, wav]  ="voice/Training/Mission1/T1_06.wav";	
	%who.text[T1_06, eval] ="flashEnergy();";
	%who.text[T1_tipenergy, wav]  ="voice/Training/Mission1/T1.tip.energy.wav";	
	%who.text[T1_08, wav]  ="voice/Training/Mission1/T1_08.wav";	
	%who.text[T1_08, eval] ="flashInventory();";
	%who.text[T1_09, wav]  ="voice/Training/Mission1/T1_09.wav";	
	%who.text[T1_09, eval] ="flashSensor();";
	%who.text[T1_10, wav]  ="voice/Training/Mission1/T1_10.wav";	
	%who.text[T1_10, text]  ="Press "@findTrainingControlButtons(toggleHelpGui)@" to toggle HUD help.";	
	%who.text[T1_10, eval]  ="autoToggleHelpHud(false);";	
	%who.text[T1_10a, wav]  ="voice/Training/Mission1/T1_10a.wav";	
	%who.text[T1_10a, eval] ="setWaypointAt(\"-287.5 393.1 76.2\", \"Health Patches\");movemap.push();$player.player.setMoveState(false);";
	%who.text[T1_10b, wav]  ="voice/Training/Mission1/T1_10b.wav";	
	%who.text[T1_10b, text] ="Run over freestanding Health Patches to repair your armor.";
	%who.text[T1_10b, eval] = "$player.hurryUp = schedule(40000, 0, hurryPlayerUp); endOpeningSpiel(); updateTrainingObjectiveHud(obj8);";
	%who.text[T1_tipjets01, wav]  ="voice/Training/Mission1/T1.tip.jets01.wav";	
	%who.text[T1_tipjets01, text] ="Press "@findTrainingControlButtons(Jump)@" to jump. "@findTrainingControlButtons(mouseJet)@" triggers the jets. Jump just before you jet to increase jetting distance.";
	%who.text[T1_11, wav]  ="voice/Training/Mission1/T1_11.wav";	
	%who.text[T1_11, text] ="When necessary, press "@findTrainingControlButtons(useRepairKit)@" to trigger your armor's health kit for partial repairs.";
	%who.text[T1_12a, wav]  ="voice/Training/Mission1/T1_12a.wav";	
	%who.text[T1_12b, wav]  ="voice/Training/Mission1/T1_12b.wav";	
	%who.text[T1_tipIFF, wav]  ="voice/Training/Mission1/T1.tip.IFF.wav";	
	%who.text[T1_13, wav]  ="voice/Training/Mission1/T1_13.wav";	
	%who.text[T1_13, eval]  ="updateTrainingObjectiveHud(obj7);";	
	%who.text[T1_14, wav]  ="voice/Training/Mission1/T1_14.wav";	
	%who.text[T1_14, eval] ="flashWeapon(0);";
	%who.text[T1_tipblaster01, wav]  ="voice/Training/Mission1/T1.tip.blaster01.wav";	
	%who.text[T1_15, wav]  ="voice/Training/Mission1/T1_15.wav";	
	%who.text[T1_15, eval] ="flashWeapon(2);";
	%who.text[T1_tipchaingun, wav]  ="voice/Training/Mission1/T1.tip.chaingun.wav";	
	%who.text[T1_16, wav]  ="voice/Training/Mission1/T1_16.wav";	
	%who.text[T1_16, eval] ="flashWeapon(3); ";
	%who.text[T1_tipspinfusor, wav]  ="voice/Training/Mission1/T1.tip.spinfusor.wav";	
	%who.text[T1_17, wav]  ="voice/Training/Mission1/T1_17.wav";	
	%who.text[T1_17, eval] = "flashWeaponsHud();";
	%who.text[T1_tipblaster02, wav] ="voice/Training/Mission1/T1.tip.blaster02.wav";	
	%who.text[T1_tipblaster02, eval] = "use(Blaster);";
	%who.text[T1_tipjets02, wav]  ="voice/Training/Mission1/T1.tip.jets02.wav";	
	%who.text[T1_18, wav]  ="voice/Training/Mission1/T1_18.wav";	
	//%who.text[T1_18, text] ="Press "@findTrainingControlButtons(Jump)@" to jump. "@findTrainingControlButtons(mouseJet)@" triggers the jets. Jump just before you jet to increase jetting distance.";
	%who.text[T1_18, eval] = "queEnemySet(0); activatePackage(singlePlayerMissionAreaEnforce);";
	%who.text[T1_18a, wav]  ="voice/Training/Mission1/T1_18a.wav";	
	%who.text[T1_1802, wav]  ="voice/Training/Mission1/T1_18-02.wav";	
	%who.text[T1_19, wav]  ="voice/Training/Mission1/T1_19.wav";	
	%who.text[T1_20, wav]  ="voice/Training/Mission1/T1_20.wav";	
	%who.text[T1_21, wav]  ="voice/Training/Mission1/T1_21.wav";	
	%who.text[T1_22, wav]  ="voice/Training/Mission1/T1_22.wav";	
	%who.text[T1_22, eval] ="setWaypointat(nameToId(Tower).position, \"BE Tower\"); updateTrainingObjectiveHud(obj4);";
	%who.text[T1_22a, wav]  ="voice/Training/Mission1/T1_22a.wav";	
	%who.text[T1_23, wav]  ="voice/Training/Mission1/T1_23.wav";	
	%who.text[T1_23a, wav]  ="voice/Training/Mission1/T1_23a.wav";	
	%who.text[T1_23b, wav]  ="voice/Training/Mission1/T1_23b.wav";	
	%who.text[T1_24, wav]  ="voice/Training/Mission1/T1_24.wav";	
	%who.text[T1_24, text] ="Press "@findTrainingControlButtons(throwWeapon)@" to drop your current weapon.";
	%who.text[T1_24a, wav]  ="voice/Training/Mission1/T1_24a.wav";	
	%who.text[T1_tippack01, wav]  ="voice/Training/Mission1/T1.tip.pack01.wav";	
	%who.text[T1_tippack01, eval]  ="flashPack();";	
	%who.text[T1_tipsniper01, wav]  ="voice/Training/Mission1/T1.tip.sniper01.wav";	
	%who.text[T1_tipsniper02, wav]  ="voice/Training/Mission1/T1.tip.sniper02.wav";	
	%who.text[T1_tipsniper02, text]  = "You must have an Energy Pack to fire the laser rifle.";	
	%who.text[T1_tipsniper03, wav]  ="voice/Training/Mission1/T1.tip.sniper03.wav";	
	%who.text[T1_tipsniper03, text] ="Hold down "@findTrainingControlButtons(toggleZoom)@" to trigger the zoom feature.";
	%who.text[T1_tipsniper04, wav]  ="voice/Training/Mission1/T1.tip.sniper04.wav";	
	%who.text[T1_25, wav]  ="voice/Training/Mission1/T1_25.wav";	
	%who.text[T1_25, eval]  ="updateTrainingObjectiveHud(obj3);";	
	%who.text[T1_25a, wav]  ="voice/Training/Mission1/T1_25a.wav";	
	%who.text[T1_tiptactics, wav]  ="voice/Training/Mission1/T1.tip.tactics.wav";	
	%who.text[T1_tippack02, wav]  ="voice/Training/Mission1/T1.tip.pack02.wav";	
	//%who.text[T1_tippack02, text] ="Press "@findTrainingControlButtons(useBackPack)@" to activate a pack.";
	%who.text[T1_tippack03, wav]  ="voice/Training/Mission1/T1.tip.pack03.wav";	
	%who.text[T1_26, wav]  ="voice/Training/Mission1/T1_26.wav";	
	%who.text[T1_27, wav]  ="voice/Training/Mission1/T1_27.wav";	
	%who.text[T1_27, wav]  ="voice/Training/Mission1/T1_27.wav";	
	%who.text[T1_27a, wav]  ="voice/Training/Mission1/T1_27a.wav";	
	%who.text[T1_27b, wav]  ="voice/Training/Mission1/T1_27b.wav";	
	%who.text[T1_28, wav]  ="voice/Training/Mission1/T1_28.wav";	
	%who.text[T1_28, text]  ="Jump into the vehicle to pilot it.";	
	%who.text[T1_29, wav]  ="voice/Training/Mission1/T1_29.wav";	
	%who.text[T1_29a, wav]  ="voice/Training/Mission1/T1_29a.wav";	
	%who.text[T1_29a, text] ="Control vehicles the same way you control your armor. "@findTrainingControlButtons(mouseJet)@" triggers a turbo boost instead of jets.";
	%who.text[T1_tipskiing01, wav]  ="voice/Training/Mission1/T1.tip.skiing01.wav";	
	%who.text[T1_tipskiing01, text] ="Hold down the Jump button ("@findTrainingControlButtons(jump)@") to ski.";
	%who.text[T1_tipskiing02, wav] ="voice/Training/Mission1/T1.tip.skiing02.wav";	
	%who.text[T1_tipskiing02a, wav] ="voice/Training/Mission1/T1.tip.skiing02a.wav";	
	%who.text[T1_tipskiing03, wav]  ="voice/Training/Mission1/T1.tip.skiing03.wav";	
	%who.text[T1_30, wav]  ="voice/Training/Mission1/T1_30.wav";	

	//  Misssion 2
	%who.text[T2_01, wav]  ="voice/Training/Mission2/T2_01.wav";	
	%who.text[T2_01, eval]  = "setWaypointAt(\"-8.82616 -131.779 119.756\", \"Control Switch\");";
	%who.text[T2_01a, eval]  = "setWaypointAt(nameToId(InitialPulseSensor).position, \"Sensor\");";
	%who.text[T2_01a, wav]  ="voice/Training/Mission2/T2_01a.wav";	
	%who.text[T2_01b, wav]  ="voice/Training/Mission2/T2_01b.wav";	
	%who.text[T2_tipplasma, wav]  ="voice/Training/Mission2/T2.tip.plasma.wav";	
	%who.text[T2_tipmissile, wav]  ="voice/Training/Mission2/T2.tip.missile.wav";	
	%who.text[T2_tipmissile02, wav]  ="voice/Training/Mission2/T2.tip.missile02.wav";	
	%who.text[T2_tipmissile03, wav]  ="voice/Training/Mission2/T2.tip.missile03.wav";	
	%who.text[T2_tipevading, wav]  ="voice/Training/Mission2/T2.tip.evading.wav";	
	%who.text[T2_tiptlaser, wav]  ="voice/Training/Mission2/T2.tip.tlaser.wav";	
	%who.text[T2_tipelf, wav] ="voice/Training/Mission2/T2.tip.elf.wav";	
	%who.text[T2_02, wav]  ="voice/Training/Mission2/T2_02.wav";	
	%who.text[T2_02, eval]  = "setWaypointAt(\"-8.82616 -131.779 119.756\", \"Tower\");";
	%who.text[T2_03, wav]  ="voice/Training/Mission2/T2_03.wav";	
	%who.text[T2_03, eval]  = "setWaypointAt(\"-8.82616 -131.779 119.756\", \"Tower\");";	
	%who.text[T2_04, wav]  ="voice/Training/Mission2/T2_04.wav";	
	%who.text[T2_04a, wav]  ="voice/Training/Mission2/T2_04a.wav";	
	%who.text[T2_05, wav] ="voice/Training/Mission2/T2_05.wav";	
	%who.text[T2_05a, wav] ="voice/Training/Mission2/T2_05a.wav";	
	%who.text[T2_05b, wav] ="voice/Training/Mission2/T2_05b.wav";	
	%who.text[T2_05c, wav] ="voice/Training/Mission2/T2_05c.wav";	
	%who.text[T2_tiprepair01, wav]  ="voice/Training/Mission2/T2.tip.repair01.wav";	
	%who.text[T2_tiprepair01, text]  ="Press "@findTrainingControlButtons(useBackPack)@" to ready the repair pack.  Aim at damaged item and hold down ("@findTrainingControlButtons(mouseFire)@").";	
	%who.text[T2_tiprepair02, wav]  ="voice/Training/Mission2/T2.tip.repair02.wav";	
	%who.text[T2_tiprepair03, wav]  ="voice/Training/Mission2/T2.tip.repair03.wav";	
	%who.text[T2_tipgens01, wav]  ="voice/Training/Mission2/T2.tip.gens01.wav";	
	%who.text[T2_tipdropit, wav]  ="voice/Training/Mission2/T2.tip.dropit.wav";	
	%who.text[T2_tipdropit, text] ="Press "@findTrainingControlButtons(throwPack)@" to drop your pack.";
	%who.text[T2_07, wav]  ="voice/Training/Mission2/T2_07.wav";	
	%who.text[T2_07, eval]  ="setWaypointAt(\"380.262 -298.625 98.9719\", \"Tower\");";	
	%who.text[T2_tipscanned, wav]  ="voice/Training/Mission2/T2.tip.scanned.wav";	
	%who.text[T2_08, wav]  ="voice/Training/Mission2/T2_08.wav";	
	%who.text[T2_tipshieldpack, wav]  ="voice/Training/Mission2/T2.tip.shieldpack.wav";	
	%who.text[T2_tipshieldpack, text] ="Press "@findTrainingControlButtons(useBackPack)@" to turn the shield pack on or off.";
	%who.text[T2_tipshieldpack02, wav]  ="voice/Training/Mission2/T2.tip.shieldpack02.wav";	
	%who.text[T2_tipturret01, wav]  ="voice/Training/Mission2/T2.tip.turret01.wav";	
	%who.text[T2_tipturret02, wav]  ="voice/Training/Mission2/T2.tip.turret02.wav";	
	%who.text[T2_tipturret02, text] ="Press "@findTrainingControlButtons(useTargetingLaser)@" to arm the targeting laser.";
	%who.text[T2_cya01, wav]  ="voice/Training/Mission2/T2.cya01.wav";	
	%who.text[T2_09, wav]  ="voice/Training/Mission2/T2_09.wav";	
	%who.text[T2_09a, wav]  ="voice/Training/Mission2/T2_09a.wav";	
	%who.text[T2_09b, wav]  ="voice/Training/Mission2/T2_09b.wav";	
	%who.text[T2_10, wav]  ="voice/Training/Mission2/T2_10.wav";	
	%who.text[T2_10a, wav]  ="voice/Training/Mission2/T2_10a.wav";	
	%who.text[T2_11, wav]  ="voice/Training/Mission2/T2_11.wav";	
	%who.text[T2_tipinventory, wav]  ="voice/Training/Mission2/T2.tip.inventory.wav";	
	%who.text[T2_inventory01, wav]  ="voice/Training/Mission2/T2.inventory01.wav";	
	%who.text[T2_tipinventory01, wav]  ="voice/Training/Mission2/T2.tip.inventory01.wav";	
	%who.text[T2_tipinventory03, wav]  ="voice/Training/Mission2/T2.tip.inventory03.wav";	
	%who.text[T2_tipinventory03, text]  ="Press "@findTrainingControlButtons(toggleInventoryHud)@" to activate inventory control.";	
	%who.text[T2_tipdefense01, wav]  ="voice/Training/Mission2/T2.tip.defense01.wav";	
	%who.text[T2_tipdefense02, wav]  ="voice/Training/Mission2/T2.tip.defense02.wav";	
	%who.text[T2_tipdefense03, wav]  ="voice/Training/Mission2/T2.tip.defense03.wav";	
	%who.text[T2_tipdefense03, text] ="Press "@findTrainingControlButtons(placeMine)@" to deploy a mine. The longer you hold the key down before release, the farther the mine goes.";
	%who.text[T2_tipdefense05, wav]  ="voice/Training/Mission2/T2.tip.defense05.wav";	
	%who.text[T2_tipdefense05a, wav]  ="voice/Training/Mission2/T2.tip.defense05a.wav";	
	%who.text[T2_tipdefense06, wav]  ="voice/Training/Mission2/T2.tip.defense06.wav";	
	%who.text[T2_tipdefense07, wav]  ="voice/Training/Mission2/T2.tip.defense07.wav";	
	%who.text[T2_tipdefense08, wav]  ="voice/Training/Mission2/T2.tip.defense08.wav";	
	%who.text[T2_12, wav]  ="voice/Training/Mission2/T2_12.wav";	
	%who.text[T2_13, wav]  ="voice/Training/Mission2/T2_13.wav";	
	%who.text[T2_repairPack, wav]  ="voice/Training/Mission2/T2.repairPack.wav";	
				
	// mission 3
	%who.text[T3_01, wav]  ="voice/Training/Mission3/T3_01.wav";	
	%who.text[T3_02, wav]  ="voice/Training/Mission3/T3_02.wav";	
	%who.text[T3_cloaking, wav]  ="voice/Training/Mission3/T3.cloaking.wav";	
	%who.text[T3_cloaking, text]  = findTrainingControlButtons(useBackPack)@" activates and deactivates the cloaking pack.";	
	%who.text[T3_tipcloaking01, wav]  ="voice/Training/Mission3/T3.tip.cloaking01.wav";	
	%who.text[T3_tipcloaking02, wav]  ="voice/Training/Mission3/T3.tip.cloaking02.wav";	
	%who.text[T3_tipequipment01, wav]  ="voice/Training/Mission3/T3.tip.equipment01.wav";	
	%who.text[T3_tipequipment02, wav]  ="voice/Training/Mission3/T3.tip.equipment02.wav";	
	%who.text[T3_tippiloting01, wav]  ="voice/Training/Mission3/T3.tip.piloting01.wav";	
	%who.text[T3_03, wav]  ="voice/Training/Mission3/T3_03.wav";	
	%who.text[T3_player01, wav]  ="voice/Training/Mission3/T3.player01.wav";	
	%who.text[T3_tippiloting02, wav]  ="voice/Training/Mission3/T3.tip.piloting02.wav";	
	%who.text[T3_tippiloting03, wav]  ="voice/Training/Mission3/T3.tip.piloting03.wav";	
	%who.text[T3_warning01, wav]  ="voice/Training/Mission3/T3.warning01.wav";	
	%who.text[T3_warning02, wav]  ="voice/Training/Mission3/T3.warning02.wav";	
	%who.text[T3_warning03, wav]  ="voice/Training/Mission3/T3.warning03.wav";	
	%who.text[T3_04, wav]  ="voice/Training/Mission3/T3_04.wav";	
	%who.text[T3_tippiloting04, wav]  ="voice/Training/Mission3/T3.tip.piloting04.wav";	
	%who.text[T3_05, wav]  ="voice/Training/Mission3/T3_05.wav";	
	%who.text[T3_tipfreelook, wav]  ="voice/Training/Mission3/T3.tip.freelook.wav";	
	%who.text[T3_tipfreelook, text]  = "Press and hold "@findTrainingControlButtons(toggleFreelook)@" to allow freelook.";	
	%who.text[T3_tipunderwater01, wav]  ="voice/Training/Mission3/T3.tip.underwater01.wav";	
	%who.text[T3_tipunderwater02, wav]  ="voice/Training/Mission3/T3.tip.underwater02.wav";	
	%who.text[T3_06, wav]  ="voice/Training/Mission3/T3_06.wav";	
	%who.text[T3_07, wav]  ="voice/Training/Mission3/T3_07.wav";	
	%who.text[T3_07a, wav]  ="voice/Training/Mission3/T3_07a.wav";	
	%who.text[T3_07b, wav]  ="voice/Training/Mission3/T3_07b.wav";	
	%who.text[T3_07c, wav]  ="voice/Training/Mission3/T3_07c.wav";	
	%who.text[T3_tipcloaking03, wav]  ="voice/Training/Mission3/T3.tip.cloaking03.wav";	
	%who.text[T3_tipshocklance, wav]  ="voice/Training/Mission3/T3.tip.shocklance.wav";	
	%who.text[T3_08, wav]  ="voice/Training/Mission3/T3_08.wav";	
	%who.text[T3_08a, wav]  ="voice/Training/Mission3/T3_08a.wav";	
	%who.text[T3_08b, wav]  ="voice/Training/Mission3/T3_08b.wav";	
	%who.text[T3_09, wav]  ="voice/Training/Mission3/T3_09.wav";	
	%who.text[T3_09a, wav]  ="voice/Training/Mission3/T3_09a.wav";	
	%who.text[T3_player02, wav]  ="voice/Training/Mission3/T3.player02.wav";	
	%who.text[T3_trainer10, wav]  ="voice/Training/Mission3/T3_10.wav";	
	%who.text[T3_player03, wav]  ="voice/Training/Mission3/T3.player03.wav";	
	%who.text[T3_10, wav]  ="voice/Training/Mission3/T3_10.wav";	
	%who.text[T3_11, wav]  ="voice/Training/Mission3/T3_11.wav";	
	%who.text[T3_12, wav]  ="voice/Training/Mission3/T3_12.wav";	
	%who.text[T3_12a, wav]  ="voice/Training/Mission3/T3_12a.wav";	
	%who.text[T3_13, wav]  ="voice/Training/Mission3/T3_13.wav";	
				
	// Mission 4
	%who.text[T4_01, wav]  ="voice/Training/Mission4/T4_01.wav";	
	%who.text[T4_01, text]  ="Repair the waypointed sensor.";	
	%who.text[T4_01a, wav]  ="voice/Training/Mission4/T4_01a.wav";	
	%who.text[T4_01b, wav]  ="voice/Training/Mission4/T4_01b.wav";	
	%who.text[T4_01c, wav]  ="voice/Training/Mission4/T4_01c.wav";	
	%who.text[T4_02, wav]  ="voice/Training/Mission4/T4_02.wav";	
	%who.text[T4_02a, wav]  ="voice/Training/Mission4/T4_02a.wav";	
	%who.text[T4_02b, wav]  ="voice/Training/Mission4/T4_02b.wav";	
	%who.text[T4_03, wav]  ="voice/Training/Mission4/T4_03.wav";	
	%who.text[T4_03, eval]  ="firstPersonQuickPan();";	
	%who.text[T4_03a, wav]  ="voice/Training/Mission4/T4_03a.wav";	
	%who.text[T4_03a, text]  ="Press "@findTrainingControlButtons(toggleCommanderMap)@" to toggle your Command Circuit.";	
	%who.text[T4_03a, eval]  ="ThreeAEval();";	
	%who.text[T4_03b, wav]  ="voice/Training/Mission4/T4_03b.wav";	
	%who.text[T4_03c, wav]  ="voice/Training/Mission4/T4_03c.wav";	
	%who.text[T4_03d, wav]  ="voice/Training/Mission4/T4_03d.wav";	
	%who.text[T4_03e, wav]  ="voice/Training/Mission4/T4_03e.wav";	
	%who.text[T4_03f, wav]  ="voice/Training/Mission4/T4_03f.wav";	
	%who.text[T4_03g, wav]  ="voice/Training/Mission4/T4_03g.wav";	
	%who.text[T4_03h, wav]  ="voice/Training/Mission4/T4_03h.wav";	
	%who.text[T4_03h, text]  ="Click \"Support Assets\" to open list.";	
	%who.text[T4_03h, eval]  ="game.ExpectiongSupportButton = true;";	
	%who.text[T4_03i, wav]  ="voice/Training/Mission4/T4_03i.wav";	
	%who.text[T4_03j, wav]  ="voice/Training/Mission4/T4_03j.wav";	
	%who.text[T4_03j, text]  ="Right click on the sensor tower to activate the Orders menu.  Select Repair.";	
	%who.text[T4_03j, eval]  ="game.expectingRepairOrder = true;";	
	%who.text[T4_03k, wav]  ="voice/Training/Mission4/T4_03k.wav";	
	%who.text[T4_03k, text]  ="Arrow keys let you scroll around the map.";	
	%who.text[T4_tipCamera01, wav]  ="voice/Training/Mission4/T4.tip.Camera01.wav";	
	%who.text[T4_tipCamera01, text]  ="Press "@findTrainingControlButtons(throwGrenade)@" to throw a grenade.  The longer you press "@findTrainingControlButtons(throwGrenade)@", the farther the grenade goes.";	
	%who.text[T4_tipCamera02, wav]  ="voice/Training/Mission4/T4.tip.Camera02.wav";	
	//%who.text[T4_tipCamera02, text]  ="Click the control box to the right of a camera name to control that camera.";	
	%who.text[T4_tipCamera03, wav]  ="voice/Training/Mission4/T4.tip.Camera03.wav";	
	%who.text[T4_tipCamera04, wav]  ="voice/Training/Mission4/T4.tip.Camera04.wav";	
	%who.text[T4_controlTurret, wav]  ="voice/Training/Mission4/T4_controlTurret.wav";	
	%who.text[T4_tipobjects, wav]  ="voice/Training/Mission4/T4.tip.objects.wav";	
	%who.text[T4_CCend, wav]  ="voice/Training/Mission4/T4_CCend.wav";	
	%who.text[T4_04, wav]  ="voice/Training/Mission4/T4_04.wav";	
	%who.text[T4_04, eval] = "$random = getRandom(20,40);schedule($random, 0, doText, T4_TipDefense06);";
	%who.text[T4_tipmortar, wav]  ="voice/Training/Mission4/T4.tip.mortar.wav";	
	%who.text[T4_tipmortar02, wav] = "voice/Training/Mission4/T4.tip.mortar_02.wav";
	%who.text[T4_tipgenerator01, wav]  ="voice/Training/Mission4/T4.tip.generator01.wav";	
	%who.text[T4_tipgenerator01a, wav]  ="voice/Training/Mission4/T4.tip.generator01a.wav";	
	%who.text[T4_tipgenerator01b, wav]  ="voice/Training/Mission4/T4.tip.generator01b.wav";	
	%who.text[T4_tipgenerator02, wav]  ="voice/Training/Mission4/T4.tip.generator02.wav";	
	%who.text[T4_ffGenDown01, wav]  ="voice/Training/Mission4/T4.ff_genDown01.wav";	
	%who.text[T4_ffGenDown02, wav]  ="voice/Training/Mission4/T4.ff_genDown02.wav";	
	%who.text[T4_fieldsUp01, wav]  ="voice/Training/Mission4/T4.fieldsUp01.wav";	
	%who.text[T4_fieldsUp02, wav]  ="voice/Training/Mission4/T4.fieldsUp02.wav";	
	%who.text[T4_forceFields01, wav]  ="voice/Training/Mission4/T4.forceFields01.wav";	
	%who.text[T4_forceFields02, wav]  ="voice/Training/Mission4/T4.forceFields02.wav";	
	%who.text[T4_trainer04a, wav]  ="voice/Training/Mission4/T4_04a.wav";	
	%who.text[T4_trainer04b, wav]  ="voice/Training/Mission4/T4_04b.wav";	
	%who.text[T4_tipdefense01, wav]  ="voice/Training/Mission4/T4.defense01.wav";	
	%who.text[T4_05, wav]  ="voice/Training/Mission4/T4_05.wav";	
	%who.text[T4_06, wav]  ="voice/Training/Mission4/T4_06.wav";	
	%who.text[T4_tipdefense02, wav]  ="voice/Training/Mission4/T4.tip.defense02.wav";	
	%who.text[T4_tipdefense03, wav]  ="voice/Training/Mission4/T4.tip.defense03.wav";	
	%who.text[T4_tipdeploy, wav]  ="voice/Training/Mission4/T4.tip.deploy.wav";	
	%who.text[T4_tipdeploy01, wav]  ="voice/Training/Mission4/T4.tip.deploy01.wav";	
	%who.text[T4_tipdeploy02, wav]  ="voice/Training/Mission4/T4.tip.deploy02.wav";	
	%who.text[T4_tipdepturret, wav]  ="voice/Training/Mission4/T4.tip.depturret.wav";	
	%who.text[T4_07, wav]  ="voice/Training/Mission4/T4_07.wav";	
	%who.text[T4_07a, wav]  ="voice/Training/Mission4/T4_07a.wav";	
	%who.text[T4_warning01, wav]  ="voice/Training/Mission4/T4.warning01.wav";	
	%who.text[T4_warning02, wav]  ="voice/Training/Mission4/T4.warning02.wav";	
	%who.text[T4_genup, wav]  ="voice/Training/Mission4/T4.genup.wav";
	%who.text[T4_genup02, wav]  ="voice/Training/Mission4/T4.genup02.wav";
	%who.text[T4_genup02a, wav]  ="voice/Training/Mission4/T4.genup02a.wav";
	%who.text[T4_repgen, wav]  ="voice/Training/Mission4/T4.repgen.wav";
	%who.text[T4_08, wav]  ="voice/Training/Mission4/T4_08.wav";	
	%who.text[T4_tipcommand05, wav]  ="voice/Training/Mission4/T4.tip.command05.wav";	
	%who.text[T4_tipdefense04, wav]  ="voice/Training/Mission4/T4.tip.defense04.wav";	
	%who.text[T4_tipdefense05, wav]  ="voice/Training/Mission4/T4.tip.defense05.wav";	
	%who.text[T4_tipdefense06, wav]  ="voice/Training/Mission4/T4.tip.defense06.wav";	
	%who.text[T4_tipdefense07, wav]  ="voice/Training/Mission4/T4.tip.defense07.wav";	
	%who.text[T4_tipdefense08, wav]  ="voice/Training/Mission4/T4.tip.defense08.wav";	
	%who.text[T4_tipdefense09, wav]  ="voice/Training/Mission4/T4.tip.defense09.wav";	
	%who.text[T4_09, wav]  ="voice/Training/Mission4/T4_09.wav";	
	%who.text[T4_10, wav]  ="voice/Training/Mission4/T4_10.wav";	
	%who.text[T4_11, wav]  ="voice/Training/Mission4/T4_11.wav";	
				
	// Mission 5
	%who.text[T5_01, wav]  ="voice/Training/Mission5/T5_01.wav";	
	%who.text[T5_02, wav]  ="voice/Training/Mission5/T5_02.wav";	
	%who.text[T5_03, wav]  ="voice/Training/Mission5/T5_03.wav";	
	%who.text[T5_04, wav]  ="voice/Training/Mission5/T5_04.wav";	
	%who.text[T5_tipstations01, wav]  ="voice/Training/Mission5/T5.tip.stations01.wav";	
	%who.text[T5_tipstations02, wav]  ="voice/Training/Mission5/T5.tip.stations02.wav";	
	%who.text[T5_05, wav]  ="voice/Training/Mission5/T5_05.wav";	
	%who.text[T5_05a, wav]  ="voice/Training/Mission5/T5_05a.wav";	
	%who.text[T5_05b, wav]  ="voice/Training/Mission5/T5_05b.wav";	
	%who.text[T5_tipsatchel01, wav]  ="voice/Training/Mission5/T5.tip.satchel01.wav";	
	%who.text[T5_tipsatchel02, wav]  ="voice/Training/Mission5/T5.tip.satchel02.wav";	
	%who.text[T5_06, wav]  ="voice/Training/Mission5/T5_06.wav";	
	%who.text[T5_06a, wav]  ="voice/Training/Mission5/T5_06a.wav";	
	%who.text[T5_06b, wav]  ="voice/Training/Mission5/T5_06b.wav";	
	%who.text[T5_06b, eval]  ="training5addSafeDistance();";	
	%who.text[T5_06c, wav]  ="voice/Training/Mission5/T5_06c.wav";	
	%who.text[T5_06c, eval]  ="training5addSafeDistance();";	
	%who.text[T5_06d, wav]  ="voice/Training/Mission5/T5_06d.wav";	
	//%who.text[T5_06d, eval]  ="training5addSafeDistance();";	
	%who.text[T5_07, wav]  ="voice/Training/Mission5/T5_07.wav";	
	%who.text[T5_Failure01, wav]  ="voice/Training/Mission5/T5.failure01.wav";	
	%who.text[T5_Failure02, wav]  ="voice/Training/Mission5/T5.failure02.wav";	
	%who.text[T5_08, wav]  ="voice/Training/Mission5/T5_08.wav";	
	%who.text[T5_08urgent, wav]  ="voice/Training/Mission5/T5_08_urgent.wav";	
	%who.text[T5_09, wav]  ="voice/Training/Mission5/T5_09.wav";	
	%who.text[T5_tipFirepower, wav]  ="voice/Training/Mission5/T5.tip.firepower.wav";	

	//===========================================================================================
	//these are the objective hud elements for single player
	// note: lines get clipped after 24 chars
	
	//format
	//%who.objHud[missionName, ObjectiveID, Line(1|2)] = "text...duh";

	//mission1
	//----------------------------------------------------------------------------
	%who.objHud[training1, obj1, 1] = "Survey Hanakush Lowlands.";
	
	%who.objHud[training1, obj2, 1] = "Remain calm during remote scan.";
	%who.objHud[training1, obj2, 2] = "Immobilization is temporary.";
	
	%who.objHud[training1, obj3, 1] = "Eliminate incoming enemies.";
	
	%who.objHud[training1, obj4, 1] = "Investigate tower at waypoint.";
	
	%who.objHud[training1, obj5, 1] = "Leave area. Avoid the enemy.";
	%who.objHud[training1, obj5, 2] = "Meet rescue team at waypoint.";
	
	%who.objHud[training1, obj6, 1] = "Go to vehicle at waypoint.";
	
	%who.objHud[training1, obj7, 1] = "Wait. Remote systems check pending.";
	
	%who.objHud[training1, obj8, 1] = "Get health patches at waypoint.";


	//mission2
	//----------------------------------------------------------------------------
	%who.objHud[training2, obj1, 1] = "Capture tower at waypoint.";
	%who.objHud[training2, obj1, 2] = "Eliminate enemy units.";
	
	%who.objHud[training2, obj2, 1] = "Rearm and defend the tower.";
	%who.objHud[training2, obj2, 2] = "Eliminate incoming enemies.";
	
	%who.objHud[training2, obj3, 1] = "Capture tower at waypoint.";
	%who.objHud[training2, obj3, 2] = "Implant digital virus.";
	
	%who.objHud[training2, obj4, 1] = "Capture tower at waypoint.";
	%who.objHud[training2, obj4, 2] = "Eliminate enemies.";
	
	%who.objHud[training2, obj5, 1] = "Destroy enemy sensor.";
	
	%who.objHud[training2, obj6, 1] = "Eliminate enemies.";
	%who.objHud[training2, obj6, 2] = "Destroy enemy turrets.";
   

	//mission 3
	//----------------------------------------------------------------------------
	%who.objHud[training3, obj1, 1] = "Board the Shrike.";
	
	%who.objHud[training3, obj2, 1] = "Pilot Shrike to enemy base.";
	%who.objHud[training3, obj2, 2] = "Locate command switch.";
	
	%who.objHud[training3, obj3, 1] = "Fly to extraction point.";
	
	%who.objHud[training3, obj4, 1] = "Primary Objective Complete.";
	%who.objHud[training3, obj4, 2] = "Return to the Shrike.";

	%who.objHud[training3, obj5, 1] = "Destroy Forcefield Power";
	%who.objHud[training3, obj5, 2] = "to disable Control Point shield.";

	%who.objHud[training3, obj6, 1] = "Implant digital virus";
	%who.objHud[training3, obj6, 2] = "at Control Point.";


	//mission 4
	//----------------------------------------------------------------------------
	%who.objHud[training4, obj1, 1] = "Stay alert for enemy presence.";
	%who.objHud[training4, obj1, 2] = "Repair sensor at waypoint.";
	
	%who.objHud[training4, obj2, 1] = "Activate Command Circuit.";
	
	%who.objHud[training4, obj3, 1] = "Deploy camera.";
	%who.objHud[training4, obj3, 2] = "Use camera to survey area.";
	
	%who.objHud[training4, obj4, 1] = "Use Command Circuit";
	%who.objHud[training4, obj4, 2] = "to control Base Turret.";

	%who.objHud[training4, obj4, 1] = "Use Command Circuit to";
 	%who.objHud[training4, obj4, 2] = "control Base Turret.";

	%who.objHud[training4, obj5, 1] = "URGENT! Base Generator cannot";
	%who.objHud[training4, obj5, 2] = "be offline longer than 60 seconds.";
	
	%who.objHud[training4, obj6, 1] = "Issue order to repair sensor \'Tycho.\'";
	
	%who.objHud[training4, obj7, 1] = "Remain still during remote";
	%who.objHud[training4, obj7, 2] = "armor systems scan.";

	%who.objHud[training4, obj9, 1] = "Deploy turrets.";
	%who.objHud[training4, obj9, 2] = "Prepare for incoming enemies.";

	%who.objHud[training4, obj10, 1] = "Defend Base!";
	%who.objHud[training4, obj10, 2] = "Keep main generator online.";

	//mission 5
	//----------------------------------------------------------------------------
	//%who.objHud[training5, obj1, 1] = "123456789A123456789B123456789C123456789";

	%who.objHud[training5, obj1, 1] = "Capture tower at waypoint.";
	%who.objHud[training5, obj1, 2] = "Implant digital virus.";

	%who.objHud[training5, obj2, 1] = "Destroy critical gens";
	%who.objHud[training5, obj2, 2] = "in the base at waypoint.";

	%who.objHud[training5, obj4, 1] = "Get out of there NOW!";



//=================================================================================
// Misc Messages
	//Mission completion/failure
	%who.miscMsg[trainingGenericwin] = "Good Job.";
	%who.miscMsg[trainingGenericLoss] = "Tribal life can be nasty, brutish, and short. Do you want to try again?";
	%who.miscMsg[trainingDeathLoss] = "You died. The Hordes use your gene plasm to make their reavers strong. Do you want to try again?";
	%who.miscMsg[training1win] = "Welcome back! You evaded the BioDerm pursuit. Not many warriors return from being shot down. Strike Colonel Akanruth wants a full debriefing.";
	%who.miscMsg[training2win] = "You broke the back of Horde resistance in your area, and your prowess is noted. An army needs food to keep fighting, and now we have a secure supply.";
	%who.miscMsg[training3win] = "The data provides key insights into Derm psychology and internal organization. We can now refine our strategic approach to exploit these vulnerabilities.";
	%who.miscMsg[training3shrikeLoss] = "Without the Shrike, you are stranded too far from Pact territory. The BioDerms hunt you down like a dog and destroy you. Do you want to try again?";
	%who.miscMsg[training4win] = "The BioDerm thrust at Nagakhun was shattered, thanks to you. The Derms fail to escape pursuing Pact warriors. Good work!";
	%who.miscMsg[training4GenLoss] = "The main generator remained offline too long, and the BioDerms took the base. Your head now hangs on their Flaymaster's wall. Do you want to try again?";
	%who.miscMsg[training5DistFail]  = "You were too close to the blast. A Pact rescue team finds your broken remains and returns them for a hero's burial.";
	%who.miscMsg[training5win] = "Congratulations. With the base destroyed, the Pact overwhelmed Horde defenses. The war continues, but we have broken the back of the BioDerm invasion.";
	%who.miscMsg[training5loss] = "You completed your objective but failed to escape the blast. Too bad. Would you like to try again and find out if you can survive?";
	%who.miscMsg[trainingOverEasy] = "You have mastered the basic skills. Consider further training in bot matches or a higher difficulty level.";
	%who.miscMsg[trainingOverMed] = "You are skilled enough to enter online play with confidence.";
	%who.miscMsg[trainingOverHard] = "You have God-like skills and should have your trigger finger bronzed.";

// -these are here so that they can be edited without the game script being molested
// -also for ease of localization (if necessary)
	
	//otherMessages
	%who.miscMsg[noScoreScreen] = "The Score screen is disabled in the training missions.";
	%who.miscMsg[noCC] = "You are not yet cleared for Command Circuit use.";
	%who.miscMsg[genAttackNoSatchel] = "You can only destroy the enemy generators by using a satchel charge.  The chain reaction will not trigger otherwise.";
	%who.miscMsg[OOB] = "You have left the mission area.";
	%who.miscMsg[InBounds] = "You have returned to the mission area.";
	%who.miscMsg[OOBLoss] = "You were outside the mission area too long. Do you want to try again?";
	%who.miscMsg[LeaveGame] = "Are you sure you want to abandon this game?";
   %who.miscMsg[noTaskListDlg] = "You have not yet been granted access to the task list dialog.";
   %who.miscMsg[noInventoryHUD] = "You have not yet been granted access to the Inventory HUD.";
}

				
$EnemyNameList[1  ] = "Demon-Core";
$EnemyNameList[2  ] = "Blood-Drinker";
$EnemyNameList[3  ] = "Shargh-zhor";
$EnemyNameList[4  ] = "Azarok";
$EnemyNameList[5  ] = "Storm-of-Death";
$EnemyNameList[6  ] = "Gut Collar";
$EnemyNameList[7  ] = "Torment-the-Weak";
$EnemyNameList[8  ] = "Eats Only Heads";
$EnemyNameList[9  ] = "Koroz the Skull";
$EnemyNameList[10 ] = "Murkhofud";
$EnemyNameList[11 ] = "Broken Horn";
$EnemyNameList[12 ] = "Red Maw";
$EnemyNameList[13 ] = "Rragh Zhek";
$EnemyNameList[14 ] = "Yellowfang";
$EnemyNameList[15 ] = "Old Scarred One";
$EnemyNameList[16 ] = "Hrreshig";
$EnemyNameList[17 ] = "Marakh the Strong";
$EnemyNameList[18 ] = "Spits-Brains";
$EnemyNameList[19 ] = "Cracks-to-Bone";
$EnemyNameList[20 ] = "Gul-Khidor";
$EnemyNameList[21 ] = "Kolkhris";
$EnemyNameList[22 ] = "Render-of-Men";
$EnemyNameList[23 ] = "Ribshatter";
$EnemyNameList[24 ] = "Gerex Chol";
$EnemyNameList[25 ] = "Seregh-zhor";
$EnemyNameList[26 ] = "Lokh Bloodweb";
$EnemyNameList[27 ] = "Devours-All";
$EnemyNameList[28 ] = "The Dracorox";
$EnemyNameList[29 ] = "Tarh the Immortal";
$EnemyNameList[30 ] = "Suntalon";
$EnemyNameList[31 ] = "Omakhros";
$EnemyNameList[32 ] = "Horgoth the Mad";
$EnemyNameList[33 ] = "Spines-for-Spears";
$EnemyNameList[34 ] = "Terrible Claw";
$EnemyNameList[35 ] = "Crush the Humans!";
$EnemyNameList[36 ] = "Arhakhral";
$EnemyNameList[37 ] = "Talons-of-Stone";
$EnemyNameList[38 ] = "Burns-the-Monkeys";
$EnemyNameList[39 ] = "Chainbreaker";
$EnemyNameList[40 ] = "Breath-of-Fear";
$EnemyNameList[41 ] = "Stoneskin";
$EnemyNameList[42 ] = "Piths-the-Prey";
$EnemyNameList[43 ] = "Mercy to Carrion";
$EnemyNameList[44 ] = "Dark-Entrails";
$EnemyNameList[45 ] = "Flaymaster Zhor";
$EnemyNameList[46 ] = "Flaymaster Garakh";
$EnemyNameList[47 ] = "Flaymaster Khel";
$EnemyNameList[48 ] = "Flaymaster Morax";
$EnemyNameList[49 ] = "Flaymaster Khun";
$EnemyNameList[50 ] = "Mhor Chrak-Khor";
$EnemyNameList[51 ] = "Plague Dog!";
$EnemyNameList[52 ] = "Seg Mrazhurr";
$EnemyNameList[53 ] = "Skullcrusher";
$EnemyNameList[54 ] = "Boneboiler";
$EnemyNameList[55 ] = "Murder Beast";
$EnemyNameList[56 ] = "Zura Zorhak";
$EnemyNameList[57 ] = "Hearteater";
$EnemyNameList[58 ] = "Durakh Zon";
$EnemyNameList[59 ] = "Hide-of-Steel";
$EnemyNameList[60 ] = "All Snakes Die";
$EnemyNameList[61 ] = "Monkey Guts";
$EnemyNameList[62 ] = "Throat\'s Bane";
$EnemyNameList[63 ] = "Mukhrak Dar";
$EnemyNameList[64 ] = "Skins-the-Foe";
$EnemyNameList[65 ] = "Rogh the Fearslayer";
$EnemyNameList[66 ] = "Coat-of-Eyes";
$EnemyNameList[67 ] = "Mormoghast";
$EnemyNameList[68 ] = "Bringer-of-Pain";
$EnemyNameList[69 ] = "Devilclaw";
$EnemyNameList[70 ] = "Sows-Terror";
$EnemyNameList[71 ] = "Smiles-to-Kill";
$EnemyNameList[72 ] = "Scarred-by-Plasma";
$EnemyNameList[73 ] = "The Burned One";
$EnemyNameList[74 ] = "Charred Fangs";
$EnemyNameList[75 ] = "Kro Serexhar";
$EnemyNameList[76 ] = "Ku Annorkh";
$EnemyNameList[77 ] = "Gorog the Bull";
$EnemyNameList[78 ] = "Collar-of-Fingers";
$EnemyNameList[79 ] = "Nurog the Dire";
$EnemyNameList[80 ] = "Fharox the Cruel";
$EnemyNameList[81 ] = "Sixty Notches";
$EnemyNameList[82 ] = "Tribekiller";
$EnemyNameList[83 ] = "Bluefang";
$EnemyNameList[84 ] = "Torox Backbreaker";
$EnemyNameList[85 ] = "Dreadbite";
$EnemyNameList[86 ] = "Skarjett";
$EnemyNameList[87 ] = "Face of Thorns";
$EnemyNameList[88 ] = "Gorh Bloodcloud";
$EnemyNameList[89 ] = "Song-of-Carnage";
$EnemyNameList[90 ] = "Rrshak Grinds-All";
$EnemyNameList[91 ] = "Rage-of-Night";
$EnemyNameList[92 ] = "Irokhirr Zhor";
$EnemyNameList[93 ] = "Numankh Bloodcark";
$EnemyNameList[94 ] = "Stonefist Durok";
$EnemyNameList[95 ] = "Denier-of-Soup";
$EnemyNameList[96 ] = "Grendel\'s Kiss";
$EnemyNameList[97 ] = "Karghaz Jok";
$EnemyNameList[98 ] = "Liverthief";
$EnemyNameList[99 ] = "Tumoz Agarh";
$EnemyNameList[100] = "Thirsts-for-Vengeance";
$EnemyNameList[101] = "Malevolox";
$EnemyNameList[102] = "Splinters-Ribs";
$EnemyNameList[103] = "Taunts-the-Prey";
$EnemyNameList[104] = "Glory-in-Pain";
$EnemyNameList[105] = "Monkeykiller";
$EnemyNameList[106] = "Gir QIXOR";
$EnemyNameList[107] = "Rags-of-Flesh";
$EnemyNameList[108] = "Gerhrak Icerender";
$EnemyNameList[109] = "Mordhul Nom";
$EnemyNameList[110] = "Mother of Battles";
$EnemyNameList[111] = "Kill-the-Awkward";
$enemyNameCount = 111;  //Blake, this number should be the same as the last name in the list