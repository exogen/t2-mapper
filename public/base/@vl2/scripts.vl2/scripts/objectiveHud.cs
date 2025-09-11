// Mission type-dependent objective HUDs

// TR2 additions
$TR2::Color::CarrierEnemy = "205 0 0 100";
$TR2::Color::CarrierFriendly = "0 205 0 100";
$TR2::Color::CarrierNeutral = "190 190 190 100";
$TR2::DebriefGuiLoaded = 0;

addMessageCallback('MsgClientReady', setCameraSpeedState);

function setCameraSpeedState(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
	if( detag(%gameType) $= "TR2Game" )
	{
		$_Camera::movementSpeed = $Camera::movementSpeed;
		$Camera::movementSpeed = 80;
	}
	else
	{
		%val = $_Camera::movementSpeed $= "" ? 40 : $_Camera::movementSpeed;
		$Camera::movementSpeed = %val;
	}
}

///// -MISSION START- //////////////////////////////////////////////////////////////
addMessageCallback('MsgClientReady', clientReadyMSG);

function clientReadyMSG(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
	clearObjHudMSG();
	setupObjHud(%gameType);
}

addMessageCallback('MsgClearObjHud', clearObjHudMSG);

function clearObjHudMSG(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	// clear the separator lines
	objectiveHud.setSeparators("");
	objectiveHud.disableHorzSeparator();

	
	//remove everything in the objective Hud
	while (objectiveHud.getCount() > 0)
		objectiveHud.getObject(0).delete();
}

// TR2 Message Callbacks - AO
//-----------------------
// 05-13 removed the team size window
// 05-13 Removed syntax bug in hud (doh!)
//			Created separate message type/callback and serverside function for adjusting bonus value
//			Scores can now be updated independantly of bons value
//
//			NEED TO ADD CODE TO MESSAGE CLIENT THE BONUS VALUE AND TEAM WHEN THEY JOIN!!!


addMessageCallback('MsgTR2UpdateBonus', handleTR2UpdateBonus);



addMessageCallback('MsgTR2ObjInit', TR2HudInit);

function TR2HudInit(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9)
{
	objectiveHud.teamName[1].setValue(detag(%a1));
	objectiveHud.teamName[2].setValue(detag(%a2));

	objectiveHud.teamScore[1].setValue(detag(%a3));
	objectiveHud.teamScore[2].setValue(detag(%a4));

	objectiveHud.carrierName.setValue(detag(%a5));
	objectiveHud.carrierHealth.setValue(detag(%a6));

	TR2BonusObject.doBonus(%a7, $TR2::NeutralColor);
}

addMessageCallback('MsgTR2SetScore', handleTR2SetScore);

function handleTR2SetScore(%msgType, %msgString, %team, %score)
{
	%team = detag(%team);
	objectiveHud.teamScore[%team].setValue( detag(%score) );
}
// end TR2 message callbacks - AO

// REPLACE profile definition in objectiveHud.cs
new GuiControlProfile ("TR2CarrierHealth")
{
   opaque = false;
   fillColor = "0 205 0 100";
   border = true;
   borderColor   = "190 190 190 100";
};

addMessageCallback('MsgTR2FlagStatus', handleTR2FlagStatus);

function handleTR2FlagStatus(%msgType, %msgString, %location)
{
	objectiveHud.carrierName.setValue(detag(%location));
}

addMessageCallback('MsgTR2FlagTaken', handleTR2FlagTaken);

function handleTR2FlagTaken(%msgType, %msgString, %client, %team, %flagteam, %clientnamebase)
{
	objectiveHud.carrierName.setValue(detag(%client));
}

addMessageCallback('MsgTR2FlagDropped', handleTR2FlagDropped);

function handleTR2FlagDropped(%msgType, %msgString, %client, %team, %flagteam) 
{
	objectiveHud.carrierName.setValue("Dropped");
}

addMessageCallback('MsgTR2CarrierHealth', handleTR2CarrierHealth);

function handleTR2CarrierHealth(%msgType, %msgString, %amt, %team)
{
	if( detag(%team) == 1 ) // carrier is on our team
	{
		objectiveHud.carrierHealth.profile.fillColor = $TR2::Color::CarrierFriendly;
	}
	else
	{
		objectiveHud.carrierHealth.profile.fillColor = $TR2::Color::CarrierEnemy;
	}
	objectiveHud.carrierHealth.setValue(detag(%amt));
}

function setupObjHud(%gameType)
{
   if(%gameType $= "PracticeCTFGame" || %gameType $= "CTFPlusGame")
      %gameType = "CTFGame";

   objectiveHud.gameType = %gameType;
   
   // TR2 additions
   if( %gameType $= "TR2Game" )
   {
   	if( $TR2::DebriefGuiLoaded == 0 )
   	{
   		if( isObject(DB_ChatDlg) )
   			DB_ChatDlg.delete();
   		if( isObject(DebriefGui) )
   			DebriefGui.delete();
   		exec("gui/TR2DebriefGui.gui");
   		$TR2::DebriefGuiLoaded = 1;
   	}
   }
   else
   {
   	if( $TR2::DebriefGuiLoaded == 1 )
   	{
	   	if( isObject(DB_ChatDlg) )
	   		DB_ChatDlg.delete();
	   	if( isObject(DebriefGui) )
	   		DebriefGui.delete();
	   	exec("gui/DebriefGui.gui");
	   	$TR2::DebriefGuiLoaded = 0;
	}
   }

   switch$ (%gameType)
   {
		// Begin TR2 hud stuff - AO
		case TR2Game:	// <player cnt> | <Your team> | <score> | < Carrier Name >
							//	<player cnt> | <Other team>| <score> | <Carrier Health>
			// set separators
			objectiveHud.setSeparators("104 147");
			objectiveHud.enableHorzSeparator();

			// Team names
			objectiveHud.teamName[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGoldLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "96 16";
				visible = "1";
			};
			objectiveHud.teamName[2] = new GuiTextCtrl() {
				profile = "GuiTextObjSilverLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "96 16";
				visible = "1";
			};
			// Team scores
			objectiveHud.teamScore[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGoldCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "108 3";
				extent = "35 16";
				visible = "1";
			};
			objectiveHud.teamScore[2] = new GuiTextCtrl() {
				profile = "GuiTextObjSilverCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "108 19";
				extent = "35 16";
				visible = "1";
			};

			// Bonus
			objectiveHud.carrierName = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "151 3";
				extent = "90 16";
				visible = "1";
				text = "";
			};
			objectiveHud.carrierHealth = new GuiProgressCtrl() {
				profile = "TR2CarrierHealth";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "159 22";
				extent = "75 10";
				minExtent = "8 8";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
			};

			for(%i = 1; %i <= 2; %i++)
			{
				objectiveHud.add(objectiveHud.teamScore[%i]);
				objectiveHud.add(objectiveHud.teamName[%i]);
			}
			objectiveHud.add(objectiveHud.carrierName);
			objectiveHud.add(objectiveHud.carrierHealth);
			
			// end TR2 Hud stuff - AO
		
		case BountyGame:
			// set separators
			objectiveHud.setSeparators("56 156");
			objectiveHud.disableHorzSeparator();

			// Your score label ("SCORE")
			objectiveHud.scoreLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "50 16";
				visible = "1";
				text = "SCORE";
			};
			// Your score
			objectiveHud.yourScore = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 3";
				extent = "90 16";
				visible = "1";
			};
			// Target label ("TARGET")
			objectiveHud.targetLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "50 16";
				visible = "1";
				text = "TARGET";
			};
			// your target's name
			objectiveHud.yourTarget = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 19";
				extent = "90 16";
				visible = "1";
			};

			objectiveHud.add(objectiveHud.scoreLabel);
			objectiveHud.add(objectiveHud.yourScore);
			objectiveHud.add(objectiveHud.targetLabel);
			objectiveHud.add(objectiveHud.yourTarget);

		case CnHGame:
			// set separators
			objectiveHud.setSeparators("96 162 202");
			objectiveHud.enableHorzSeparator();

			// Team names
			objectiveHud.teamName[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "90 16";
				visible = "1";
			};
			objectiveHud.teamName[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "90 16";
				visible = "1";
			};
			// Team scores
			objectiveHud.teamScore[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "105 3";
				extent = "50 16";
				visible = "1";
			};
			objectiveHud.teamScore[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "105 19";
				extent = "50 16";
				visible = "1";
			};
			// Hold label ("HOLD")
			objectiveHud.holdLabel[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "165 3";
				extent = "35 16";
				visible = "1";
				text = "HOLD";
			};
			objectiveHud.holdLabel[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "165 19";
				extent = "35 16";
				visible = "1";
				text = "HOLD";
			};
			// number of points held
			objectiveHud.numHeld[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "205 3";
				extent = "30 16";
				visible = "1";
			};
			objectiveHud.numHeld[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "205 19";
				extent = "30 16";
				visible = "1";
			};

			for(%i = 1; %i <= 2; %i++)
			{
				objectiveHud.add(objectiveHud.teamName[%i]);
				objectiveHud.add(objectiveHud.teamScore[%i]);
				objectiveHud.add(objectiveHud.holdLabel[%i]);
				objectiveHud.add(objectiveHud.numHeld[%i]);
			}

		case CTFGame:
			// set separators
			objectiveHud.setSeparators("75 100 133");
			objectiveHud.enableHorzSeparator();

			// Team names
			objectiveHud.teamName[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "68 16";
				visible = "1";
			};
			objectiveHud.teamName[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "68 16";
				visible = "1";
			};
			// Team scores
			objectiveHud.teamScore[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "78 3";
				extent = "22 16";
				visible = "1";
			};
			objectiveHud.teamScore[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "78 19";
				extent = "22 16";
				visible = "1";
			};
			// Flag label ("FLAG")
			objectiveHud.flagLabel[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "103 3";
				extent = "30 16";
				visible = "1";
				text = "FLAG";
			};
			objectiveHud.flagLabel[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "103 19";
				extent = "30 16";
				visible = "1";
				text = "FLAG";
			};
			// flag location (at base/in field/player carrying it)
			objectiveHud.flagLocation[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "138 3";
				extent = "102 16";
				visible = "1";
			};
			objectiveHud.flagLocation[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "138 19";
				extent = "102 16";
				visible = "1";
			};

			for(%i = 1; %i <= 2; %i++)
			{
				objectiveHud.add(objectiveHud.teamName[%i]);
				objectiveHud.add(objectiveHud.teamScore[%i]);
				objectiveHud.add(objectiveHud.flagLabel[%i]);
				objectiveHud.add(objectiveHud.flagLocation[%i]);
			}

		case DMGame:
			// set separators
			objectiveHud.setSeparators("56 96 156");
			objectiveHud.disableHorzSeparator();

			// Your score label ("SCORE")
			objectiveHud.scoreLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "50 16";
				visible = "1";
				text = "SCORE";
			};
			// Your score
			objectiveHud.yourScore = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 3";
				extent = "30 16";
				visible = "1";
			};
			// Your kills label ("KILLS")
			objectiveHud.killsLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "50 16";
				visible = "1";
				text = "KILLS";
			};
			// Your kills
			objectiveHud.yourKills = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 19";
				extent = "30 16";
				visible = "1";
			};
			// Your deaths label ("DEATHS")
			objectiveHud.deathsLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "100 19";
				extent = "50 16";
				visible = "1";
				text = "DEATHS";
			};
			// Your deaths
			objectiveHud.yourDeaths = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "160 19";
				extent = "30 16";
				visible = "1";
			};

			objectiveHud.add(objectiveHud.scoreLabel);
			objectiveHud.add(objectiveHud.yourScore);
			objectiveHud.add(objectiveHud.killsLabel);
			objectiveHud.add(objectiveHud.yourKills);
			objectiveHud.add(objectiveHud.deathsLabel);
			objectiveHud.add(objectiveHud.yourDeaths);

      case HuntersGame:
			// set separators
			objectiveHud.setSeparators("96 132");
			objectiveHud.disableHorzSeparator();

			// Your score label ("SCORE")
			objectiveHud.scoreLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "90 16";
				visible = "1";
				text = "SCORE";
			};
			// Your score
			objectiveHud.yourScore = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "100 3";
				extent = "30 16";
				visible = "1";
			};
			// flags label ("FLAGS")
			objectiveHud.flagLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "90 16";
				visible = "1";
				text = "FLAGS";
			};
			// number of flags
			objectiveHud.yourFlags = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "100 19";
				extent = "30 16";
				visible = "1";
			};

			objectiveHud.add(objectiveHud.scoreLabel);
			objectiveHud.add(objectiveHud.yourScore);
			objectiveHud.add(objectiveHud.flagLabel);
			objectiveHud.add(objectiveHud.yourFlags);

		case RabbitGame:
			// set separators
			objectiveHud.setSeparators("56 156");
			objectiveHud.disableHorzSeparator();

			// Your score label ("SCORE")
			objectiveHud.scoreLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "50 16";
				visible = "1";
				text = "SCORE";
			};
			// Your score
			objectiveHud.yourScore = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 3";
				extent = "90 16";
				visible = "1";
			};
			// Rabbit label ("RABBIT")
			objectiveHud.rabbitLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "50 16";
				visible = "1";
				text = "RABBIT";
			};
			// rabbit name
			objectiveHud.rabbitName = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 19";
				extent = "90 16";
				visible = "1";
			};

			objectiveHud.add(objectiveHud.scoreLabel);
			objectiveHud.add(objectiveHud.yourScore);
			objectiveHud.add(objectiveHud.rabbitLabel);
			objectiveHud.add(objectiveHud.rabbitName);

		case SiegeGame:
			// set separators
			objectiveHud.setSeparators("96 122 177");
			objectiveHud.enableHorzSeparator();

			// Team names
			objectiveHud.teamName[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "90 16";
				visible = "1";
			};
			objectiveHud.teamName[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "90 16";
				visible = "1";
			};
			// Team scores
			objectiveHud.teamScore[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "100 3";
				extent = "20 16";
				visible = "1";
			};
			objectiveHud.teamScore[2] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "100 19";
				extent = "20 16";
				visible = "1";
			};
			// Role label ("PROTECT" or "DESTROY")
			objectiveHud.roleLabel[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "125 3";
				extent = "50 16";
				visible = "1";
			};
			objectiveHud.roleLabel[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "125 19";
				extent = "50 16";
				visible = "1";
			};
			// number of objectives to protect/destroy
			objectiveHud.objectives[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "180 3";
				extent = "60 16";
				visible = "1";
			};
			objectiveHud.objectives[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "180 19";
				extent = "60 16";
				visible = "1";
			};

			for(%i = 1; %i <= 2; %i++)
			{
				objectiveHud.add(objectiveHud.teamName[%i]);
				objectiveHud.add(objectiveHud.teamScore[%i]);
				objectiveHud.add(objectiveHud.roleLabel[%i]);
				objectiveHud.add(objectiveHud.objectives[%i]);
			}

		case TeamHuntersGame:
			// set separators
			objectiveHud.setSeparators("57 83 197");
			objectiveHud.enableHorzSeparator();

			// flags label ("FLAGS")
			objectiveHud.flagLabel = new GuiTextCtrl() {
				profile = "GuiTextObjGreenLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "50 16";
				visible = "1";
				text = "FLAGS";
			};
			// number of flags
			objectiveHud.yourFlags = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 3";
				extent = "20 16";
				visible = "1";
			};
			// team names
			objectiveHud.teamName[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "85 3";
				extent = "110 16";
				visible = "1";
			};
			objectiveHud.teamName[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "85 19";
				extent = "110 16";
				visible = "1";
			};
			// team scores
			objectiveHud.teamScore[1] = new GuiTextCtrl() {
				profile = "GuiTextObjGreenCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "200 3";
				extent = "40 16";
				visible = "1";
			};
			objectiveHud.teamScore[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudCenterProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "200 19";
				extent = "40 16";
				visible = "1";
			};

			objectiveHud.add(objectiveHud.flagLabel);
			objectiveHud.add(objectiveHud.yourFlags);
			for(%i = 1; %i <= 2; %i++)
			{
				objectiveHud.add(objectiveHud.teamName[%i]);
				objectiveHud.add(objectiveHud.teamScore[%i]);
			}

		case SinglePlayerGame:
			// no separator lines
			objectiveHud.setSeparators("");
			objectiveHud.disableHorzSeparator();

			// two lines to print objectives
			objectiveHud.spText[1] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 3";
				extent = "235 16";
				visible = "1";
			};
			objectiveHud.spText[2] = new GuiTextCtrl() {
				profile = "GuiTextObjHudLeftProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 19";
				extent = "235 16";
				visible = "1";
			};
			objectiveHud.add(objectiveHud.spText[1]);
			objectiveHud.add(objectiveHud.spText[2]);
      // z0dd - ZOD, 9/13/02. New gametype
      case JBGame:
         // set separators
         objectiveHud.setSeparators("64 114 152 202");
         objectiveHud.enableHorzSeparator();

         // Team names
         objectiveHud.teamName[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenLeftProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "4 3";
            extent = "60 16";
            visible = "1";
         };
         objectiveHud.teamName[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudLeftProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "4 19";
            extent = "60 16";
            visible = "1";
         };
         // In Jail ("JAILED")
         objectiveHud.inJailLabel[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "68 3";
            extent = "42 16";
            visible = "1";
            text = "JAILED";
         };
         objectiveHud.inJailLabel[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "68 19";
            extent = "42 16";
            visible = "1";
            text = "JAILED";
         };
         // Players in Jail
         objectiveHud.playersJailed[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "118 3";
            extent = "30 16";
            visible = "1";
         };
         objectiveHud.playersJailed[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "118 19";
            extent = "30 16";
            visible = "1";
         };
         // Score label ("SCORE")
         objectiveHud.scoreLabel[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "156 3";
            extent = "42 16";
            visible = "1";
            text = "SCORE";
         };
         objectiveHud.scoreLabel[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "156 19";
            extent = "42 16";
            visible = "1";
            text = "SCORE";
         };
         // scores
         objectiveHud.teamScore[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "206 3";
            extent = "30 16";
            visible = "1";
         };
         objectiveHud.teamScore[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "206 19";
            extent = "30 16";
            visible = "1";
         };
         for(%i = 1; %i <= 2; %i++)
         {
            objectiveHud.add(objectiveHud.teamName[%i]);
            objectiveHud.add(objectiveHud.inJailLabel[%i]);
            objectiveHud.add(objectiveHud.playersJailed[%i]);
            objectiveHud.add(objectiveHud.scoreLabel[%i]);
            objectiveHud.add(objectiveHud.teamScore[%i]);
         }
      // z0dd - ZOD, 9/13/02. New gametype
      case DnDGame:
         // set separators
         objectiveHud.setSeparators("75 114 150 210");
         objectiveHud.enableHorzSeparator();

         // Team names
         objectiveHud.teamName[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenLeftProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "4 3";
            extent = "68 16";
            visible = "1";
         };
         objectiveHud.teamName[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudLeftProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "4 19";
            extent = "68 16";
            visible = "1";
         };
         // Label: Scores
         objectiveHud.scoreLabel[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "75 3";
            extent = "42 16";
            visible = "1";
            text = "Score";
         };
         objectiveHud.scoreLabel[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "75 19";
            extent = "42 16";
            visible = "1";
            text = "Score";
         };
         // Team scores
         objectiveHud.teamScore[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "118 3";
            extent = "30 16";
            visible = "1";
         };
         objectiveHud.teamScore[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "118 19";
            extent = "30 16";
            visible = "1";
         };
         // Label: Objectives
         objectiveHud.objectivesLabel[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "158 3";
            extent = "44 16";
            visible = "1";
            text = "Objectives";
         };
         objectiveHud.objectivesLabel[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "158 19";
            extent = "44 16";
            visible = "1";
            text = "Objectives";
         };
         // Team objectives
         objectiveHud.objectives[1] = new GuiTextCtrl() {
            profile = "GuiTextObjGreenCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "210 3";
            extent = "30 16";
            visible = "1";
         };
         objectiveHud.objectives[2] = new GuiTextCtrl() {
            profile = "GuiTextObjHudCenterProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "210 19";
            extent = "30 16";
            visible = "1";
         };
         for(%i = 1; %i <= 2; %i++)
         {
            objectiveHud.add(objectiveHud.teamName[%i]);
            objectiveHud.add(objectiveHud.scoreLabel[%i]);
            objectiveHud.add(objectiveHud.teamScore[%i]);
            objectiveHud.add(objectiveHud.objectivesLabel[%i]);
            objectiveHud.add(objectiveHud.objectives[%i]);
         }
   }
   chatPageDown.setVisible(false);
}

addMessageCallback('MsgCheckTeamLines', checkTeamLines);

function checkTeamLines(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%team = detag(%a1);

	if(%team == 1)
		%other = 2;
	else if(%team == 2)
		%other = 1;
	else
		return;

	%tY = getWord(objectiveHud.teamName[%team].position, 1);
	%oY = getWord(objectiveHud.teamName[%other].position, 1);

	// if player's team is lower on objective hud than other team is, switch them
	if(%tY > %oY)
		swapTeamLines();
}

function swapTeamLines()
{
   // if player's team is on the bottom of the objective hud, swap them so that it's on top
   %bLeft = "GuiTextObjHudLeftProfile";
   %bCenter = "GuiTextObjHudCenterProfile";
   %gLeft = "GuiTextObjGreenLeftProfile";
   %gCenter = "GuiTextObjGreenCenterProfile";

   %teamOneY = getWord(objectiveHud.teamName[1].position, 1);
   %teamTwoY = getWord(objectiveHud.teamName[2].position, 1);

   // z0dd - ZOD, 9/13/02. Code streamlining
   %newTop = %teamOneY > %teamTwoY ? 1 : 2;
   %newBottom = %teamOneY > %teamTwoY ? 2 : 1;


   // these are present in every team-based mission type
   %nameX = firstWord(objectiveHud.teamName[1].position);
   objectiveHud.teamName[1].position = %nameX SPC %teamTwoY;
   objectiveHud.teamName[2].position = %nameX SPC %teamOneY;
   objectiveHud.teamName[%newTop].setProfile(%gLeft);
   objectiveHud.teamName[%newBottom].setProfile(%bLeft);

   %scoreX = firstWord(objectiveHud.teamScore[1].position);
   objectiveHud.teamScore[1].position = %scoreX SPC %teamTwoY;
   objectiveHud.teamScore[2].position = %scoreX SPC %teamOneY;
   objectiveHud.teamScore[%newTop].setProfile(%gCenter);
   objectiveHud.teamScore[%newBottom].setProfile(%bCenter);

   if(isObject(objectiveHud.flagLocation[1]))
   {
		// CTF
		%locatX = firstWord(objectiveHud.flagLocation[1].position);
		objectiveHud.flagLocation[1].position = %locatX SPC %teamTwoY;
		objectiveHud.flagLocation[2].position = %locatX SPC %teamOneY;
		// swap profiles so top line is green (don't bother with labels)
		objectiveHud.flagLocation[%newTop].setProfile(%gLeft);
		objectiveHud.flagLocation[%newBottom].setProfile(%bLeft);
   }
   if(isObject(objectiveHud.numHeld[1]))
   {
		// CnH
		%locatX = firstWord(objectiveHud.numHeld[1].position);
		objectiveHud.numHeld[1].position = %locatX SPC %teamTwoY;
		objectiveHud.numHeld[2].position = %locatX SPC %teamOneY;
		// swap profiles so top line is green (don't bother with labels)
		objectiveHud.numHeld[%newTop].setProfile(%gCenter);
		objectiveHud.numHeld[%newbottom].setProfile(%bCenter);
   }
   if(isObject(objectiveHud.objectives[1]))
   {
		// Siege
		%locX = firstWord(objectiveHud.roleLabel[1].position);
		objectiveHud.roleLabel[1].position = %locX SPC %teamTwoY;
		objectiveHud.roleLabel[2].position = %locX SPC %teamOneY;
		%locatX = firstWord(objectiveHud.objectives[1].position);
		objectiveHud.objectives[1].position = %locatX SPC %teamTwoY;
		objectiveHud.objectives[2].position = %locatX SPC %teamOneY;
		// swap profiles so top line is green (don't forget role label)
		objectiveHud.roleLabel[%newTop].setProfile(%gCenter);
		objectiveHud.roleLabel[%newbottom].setProfile(%bCenter);
		objectiveHud.objectives[%newTop].setProfile(%gCenter);
		objectiveHud.objectives[%newbottom].setProfile(%bCenter);
   }
   if(isObject(objectiveHud.playersJailed[1])) // z0dd - ZOD, 9/13/02. New Gametype
   {
      %jailedX = firstWord(objectiveHud.playersJailed[1].position);
      objectiveHud.playersJailed[1].position = %jailedX SPC %teamTwoY;
      objectiveHud.playersJailed[2].position = %jailedX SPC %teamOneY;
      objectiveHud.playersJailed[%newTop].setProfile(%gCenter);
      objectiveHud.playersJailed[%newbottom].setProfile(%bCenter);
   }
   if (isObject(objectiveHud.objectives[1])) // z0dd - ZOD, 9/13/02. New Gametype
   {
      %locatX = firstWord(objectiveHud.objectives[1].position);
      objectiveHud.objectives[1].position = %locatX SPC %teamTwoY;
      objectiveHud.objectives[2].position = %locatX SPC %teamOneY;
      objectiveHud.objectives[%newTop].setProfile(%gCenter);
      objectiveHud.objectives[%newBottom].setProfile(%bCenter);
   }
}

//-----------------------------------------------------------------------------
//CLOCK HUD Callback
addMessageCallback('MsgSystemClock', setSystemClock);

function setSystemClock(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   $Hud::TimeLimit = detag(%a1);
	%timeLeftMS = detag(%a2);
	clockHud.setTime(%timeLeftMS / (60 * 1000));
}

//-----------------------------------------------------------------------------
//Generic msg callbacks...

addMessageCallback('MsgYourScoreIs', YourScoreIs);

function YourScoreIs(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   if ( isObject( objectiveHud.yourScore ) )
	   objectiveHud.yourScore.setValue( detag(%a1) );
}

addMessageCallback('MsgTeamScoreIs', teamScoreIs);

function teamScoreIs(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a1);
	%score = detag(%a2);

	if(%score $= "")
		%score = 0;

	objectiveHud.teamScore[%teamNum].setValue(%score);
}

addMessageCallback('MsgYourRankIs', yourRankIs);

function yourRankIs(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	// the rank (+1) adjustment is taken care of server-side...
	%rank = detag(%a1);
	// no longer displayed in objective hud
}

/////////////////////////////////////////////////////////////////////////////////////////
// Bounty - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('msgBountyTargetIs', bountyTargetIs);

function bountyTargetIs(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%hit = detag(%a1);
	if(%hit $= "")
		%hit = "<waiting>";

	objectiveHud.yourTarget.setValue(%hit);
}

addMessageCallback('msgBountyTargetDropped', bountyTargetDropped);
addMessageCallback('msgBountyTargetEntObs', bountyTargetDropped);

function bountyTargetDropped(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	objectiveHud.yourTarget.setValue("<waiting>");
}

//addMessageCallback('msgBountyObjRem', bountyObjRem);

function bountyObjRem(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%objRem = detag(%a1);

	// this is no longer on the objective hud
}

/////////////////////////////////////////////////////////////////////////////////////////
// CnH - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgCnHAddTeam', cnhAddTeam);

function cnhAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a1);
	%teamName = detag(%a2);
	%score = detag(%a3);
	if(%score $= "")
		%score = 0;
	%sLimit = detag(%a4);
	%held = detag(%a5);

	objectiveHud.teamName[%teamNum].setValue(%teamName);
	objectiveHud.teamScore[%teamNum].setValue(%score@"/"@%sLimit);
	objectiveHud.numHeld[%teamNum].setValue(%held);
}

addMessageCallback('MsgFlipFlopsHeld', hudFlipFlopsHeld);

function hudFlipFlopsHeld(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a1);
	%held = detag(%a2);

	objectiveHud.numHeld[%teamNum].setValue(%held);
}

addMessageCallback('MsgCnHTeamCap', cnhTeamCap);

function cnhTeamCap(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a4);
	%score = detag(%a5);
	%sLimit = detag(%a6);
	%string = %score @ "/" @ %sLimit;

	objectiveHud.teamScore[%teamNum].setValue(%string);
}

/////////////////////////////////////////////////////////////////////////////////////////
// CTF - Gui Hud Control
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgCTFAddTeam', ctfAddTeam);

function ctfAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a1); 
	%teamName = detag(%a2);
	%flagStatus = detag(%a3);
	%score = detag(%a4);

	objectiveHud.teamName[%teamNum].setValue(%teamName);
	objectiveHud.teamScore[%teamNum].setValue(%score);
	objectiveHud.flagLocation[%teamNum].setValue(%flagStatus);
}

addMessageCallback('MsgCTFFlagTaken', ctfFlagTaken);

function ctfFlagTaken(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %index = detag(%a3);
	%taker = detag(%a4);

	objectiveHud.flagLocation[%index].setValue(%taker);
}	   

addMessageCallback('MsgCTFFlagDropped', ctfFlagDropped);

function ctfFlagDropped(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %index = detag(%a3);
	objectiveHud.flagLocation[%index].setValue("<In the Field>");
}	   

addMessageCallback('MsgCTFFlagCapped', ctfFlagCapped);

function ctfFlagCapped(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %index = detag(%a3);
	objectiveHud.flagLocation[%index].setValue("<At Base>");
}	   

addMessageCallback('MsgCTFFlagReturned', ctfFlagReturned);

function ctfFlagReturned(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %index = detag(%a3);
	objectiveHud.flagLocation[%index].setValue("<At Base>");
}	   

/////////////////////////////////////////////////////////////////////////////////////////
// Deathmatch - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgDMPlayerDies', dmPlayerDies);

function dmPlayerDies(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%deaths = detag(%a1);
	objectiveHud.yourDeaths.setValue(%deaths);
}

addMessageCallback('MsgDMKill', dmKill);

function dmKill(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%kills = detag(%a1);
	objectiveHud.yourKills.setValue(%kills);
}

/////////////////////////////////////////////////////////////////////////////////////////
// Hunters - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgHuntAddTeam', huntAddTeam);

function huntAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a1);
	%teamName = detag(%a2);
	%score = detag(%a3);

	objectiveHud.teamName[%teamNum].setValue(%teamName);
	objectiveHud.teamScore[%teamNum].setValue(%score);
}

addMessageCallback('MsgHuntGreedStatus', huntGreedStatus);

function huntGreedStatus(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%greedStatus = detag(%a1);
	%greedAmount = detag(%a2);
	// no longer displayed in objective hud
}

addMessageCallback('MsgHuntHoardStatus', hunthoardStatus);

function huntHoardStatus(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	$Hud::HoardMode = detag(%a1);
	$HUD::TimeLimit = detag(%a2);
	%timeLeftMS = detag(%a3);
	$HUD::HoardStartTime = detag(%a4);
	$HUD::HoardDuration = detag(%a5);
	// no longer displayed in objective hud
}

function updateHoardStatusHUD(%timeLeftMS)
{
	// no longer displayed in objective hud
}

addMessageCallback('MsgHuntYouHaveFlags', huntYouHaveFlags);

function huntYouHaveFlags(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%numFlags = detag(%a1);
	objectiveHud.yourFlags.setValue(%numFlags);
}

/////////////////////////////////////////////////////////////////////////////////////////
// Rabbit - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgRabbitFlagTaken', rabbitFlagTaken);

function rabbitFlagTaken(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%bunny = detag(%a1);
	objectiveHud.rabbitName.setValue(%bunny);
}

addMessageCallback('MsgRabbitFlagDropped', rabbitFlagDropped);

function rabbitFlagDropped(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	objectiveHud.rabbitName.setValue("<In Field>");
}

addMessageCallback('MsgRabbitFlagReturned', rabbitFlagReturned);

function rabbitFlagReturned(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	objectiveHud.rabbitName.setValue("<At Home>");
}

addMessageCallback('MsgRabbitFlagStatus', rabbitFlagStatus);

function rabbitFlagStatus(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%flagStatus = detag(%a1);
	objectiveHud.rabbitName.setValue(%flagStatus);
}/////////////////////////////////////////////////////////////////////////////////////////
// Siege - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgSiegeAddTeam', siegeAddTeam);

function siegeAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%teamNum = detag(%a1);
	%teamName = detag(%a2);
	if(detag(%a3))
		%role = "CAPTURE";
	else
		%role = "PROTECT";

	objectiveHud.teamName[%teamNum].setValue(%teamName);
	objectiveHud.roleLabel[%teamNum].setValue(%role);
}

addMessageCallback('MsgSiegeRolesSwitched', siegeRolesSwitched);

function siegeRolesSwitched(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%newOff = detag(%a2);
	%newDef = %newOff == 1 ? 2: 1;

	objectiveHud.roleLabel[%newDef].setValue("PROTECT");
	objectiveHud.roleLabel[%newOff].setValue("CAPTURE");
	//objectiveHud.objectives[%newDef].setValue("1");
	//objectiveHud.objectives[%newOff].setValue("0");
}

/////////////////////////////////////////////////////////////////////////////////////////
// DnD - Hud Messages - z0dd - ZOD, 9/13/02.
/////////////////////////////////////////////////////////////////////////////////////////

function dndAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a1);
   %teamName = detag(%a2);
   %score = detag(%a3);
   if (%score $= "")
      %score = 0;

   %sLimit = detag(%a4);
   objectiveHud.teamName[%teamNum].setValue(%teamName);
   objectiveHud.objectives[%teamNum].setValue(%sLimit);
   objectiveHud.teamScore[%teamNum].setValue(%score);
}

function dndTeamScores(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a1);
   %teamName = detag(%a2);
   %score = detag(%a3);
   if(%score $= "")
      %score = 0;

   %sLimit = detag(%a4);
   objectiveHud.teamScore[%teamNum].setValue(%score);
}

addMessageCallback('MsgDnDAddTeam', dndAddTeam);
addMessageCallback('MsgDnDTeamScores', dndTeamScores);

/////////////////////////////////////////////////////////////////////////////////////////
// Single Player Game - Hud Messages
/////////////////////////////////////////////////////////////////////////////////////////

//addMessageCallback('MsgSPYourRankIs', spYourRankIs);

function spYourRankIs(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	//%rank = detag(%a1);
	//objectiveHud.data[1,1].setValue(%rank);
}

addMessageCallback('MsgSPCurrentObjective1', spCurrentObjective1);

function spCurrentObjective1(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%obj = detag(%a1);
	objectiveHud.spText[1].setValue(%obj);
}

addMessageCallback('MsgSPCurrentObjective2', spCurrentObjective2);

function spCurrentObjective2(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
	%obj = detag(%a1);
	objectiveHud.spText[2].setValue(%obj);
}

//addMessageCallback('MsgSPCurrentObjective3', spCurrentObjective3);

//function spCurrentObjective3(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
//{
//	%obj = detag(%a1);
//	objectiveHud.data[0,4].setValue(%obj);
//}

/////////////////////////////////////////////////////////////////////////////////////////
// JB - Hud Messages - z0dd - ZOD, 9/13/02.
/////////////////////////////////////////////////////////////////////////////////////////

function jbAddTeam(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a1);
   %teamName = detag(%a2);
   %score = detag(%a3);
   if(%score $= "")
      %score = 0;

   %jailed = detag(%a4);
   if(%jailed $= "" || %jailed < 0)
      %jailed = 0;

   objectiveHud.teamName[%teamNum].setValue(%teamName);
   objectiveHud.playersJailed[%teamNum].setValue(%jailed);
   objectiveHud.teamScore[%teamNum].setValue(%score);
}

function jbRoundHeld(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a1);
   %score = detag(%a2);

   objectiveHud.teamScore[%teamNum].setValue(%score);
}

function jbJailed(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   %teamNum = detag(%a4);
   %jailed = detag(%a5);
   if(%jailed < 0)
      %jailed = 0;

   objectiveHud.playersJailed[%teamNum].setValue(%jailed);
}

addMessageCallback('MsgJBAddTeam', jbAddTeam);
addMessageCallback('MsgJBRoundHeld', jbRoundHeld);
addMessageCallback('MsgJBJailed', jbJailed);