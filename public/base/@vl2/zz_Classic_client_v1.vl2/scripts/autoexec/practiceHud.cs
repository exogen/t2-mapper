////////////////////////////////////////////////////////////////////////////////////////
// z0dd - ZOD: PRACTICE HUD ////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// BUTTON MAP:
// ===========
// 
//  (00-09: GUI CONTROLS)
//
//  (10-19: SERVER BUTTONS)
//    10 = 999 Ammo
//    11 = Auto Return Flags
//    12 = Spawn in Favorites
//    13 = Spawn Only
//    14 = No Score Limit
//    15 = Protect Assests
//    16 = Reset Map
// 
//  (20-29: TELEPORT OPTIONS)
//    20 = Beacon Mode
//    21 = Teleport Mode
//    22 = Select
//    23 = Destroy
//    24 = Teleport
//
//  (30-39: SPAWN VEHICLE)
//    30 = Wildcat
//    31 = Beowulf
//    32 = Jericho
//    33 = Shrike
//    34 = Thundersword
//    35 = Havoc
//
//  (40-49: PROJECTILE OBSERVATION)
//    40 = Disc
//    41 = Grenade L.
//    42 = Mortar
//    43 = Missile L.

function CreatePracticeHud()
{
	$practiceHudId = new GuiControl(practiceHud) {
	profile = "GuiDialogProfile";
	horizSizing = "width";
	vertSizing = "height";
	position = "0 0";
	extent = "640 480";
	minExtent = "8 8";
	visible = "1";
	hideCursor = "0";
	bypassHideCursor = "0";
	helpTag = "0";

	new ShellPaneCtrl(practiceHudGui) {
		profile = "ShellDlgPaneProfile";
		horizSizing = "center";
		vertSizing = "center";
		position = "77 43";
		extent = "486 394";
		minExtent = "48 92";
		visible = "1";
		hideCursor = "0";
		bypassHideCursor = "0";
		helpTag = "0";
		text = "Practice Hud";
		longTextBuffer = "0";
		maxLength = "255";
		noTitleBar = "0";

		new ShellFieldCtrl(adminLBorder) {
			profile = "ShellFieldProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "20 44";
			extent = "260 126";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new ShellToggleButton(UnlimAmmoBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "0 8";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(10);";
				helpTag = "0";
				text = "999 AMMO";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(AutoReturnBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "127 8";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(11);";
				helpTag = "0";
				text = "AUTO-RETURN FLAGS";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(spawnInFavsBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "0 37";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(12);";
				helpTag = "0";
				text = "SPAWN IN FAVORITE";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(SpawnOnlyBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "127 37";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(13);";
				helpTag = "0";
				text = "SPAWN ONLY";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(NoScoreLimitBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "0 66";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(14);";
				helpTag = "0";
				text = "NO SCORE LIMIT";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(ProtectAssestsBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "127 66";
				extent = "128 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(15);";
				helpTag = "0";
				text = "PROTECT ASSETS";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellBitmapButton(ResetMapBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "73 90";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(16);";
				helpTag = "0";
				text = "RESET MAP";
				simpleStyle = "0";
			};
		};
		new ShellFieldCtrl(adminRBorder) {
			profile = "ShellFieldProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "284 44";
			extent = "184 126";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new ShellPopupMenu(practiceOptionMenu) {
				profile = "ShellPopupProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "4 -2";
				extent = "180 36";
				minExtent = "49 36";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				text = "- OPTIONS -";
				longTextBuffer = "0";
				maxLength = "255";
				maxPopupHeight = "200";
				buttonBitmap = "gui/shll_pulldown";
				rolloverBarBitmap = "gui/shll_pulldownbar_rol";
				selectedBarBitmap = "gui/shll_pulldownbar_act";
				noButtonStyle = "0";
			};
			new ShellScrollCtrl(practiceA) {
				profile = "NewScrollCtrlProfile";
				horizSizing = "right";
				vertSizing = "height";
				position = "2 25";
				extent = "181 70";
				minExtent = "24 52";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				willFirstRespond = "1";
				hScrollBar = "alwaysOff";
				vScrollBar = "dynamic";
				constantThumbHeight = "0";
				defaultLineHeight = "15";
				childMargin = "0 3";
				fieldBase = "gui/shll_field";

				new GuiScrollContentCtrl(practiceB) {
					profile = "GuiDefaultProfile";
					horizSizing = "right";
					vertSizing = "bottom";
					position = "4 7";
					extent = "157 56";
					minExtent = "8 8";
					visible = "1";
					hideCursor = "0";
					bypassHideCursor = "0";
					helpTag = "0";

					new ShellTextList(practiceSetList) {
						profile = "ShellTextArrayProfile";
						horizSizing = "right";
						vertSizing = "bottom";
						position = "0 0";
						extent = "157 234";
						minExtent = "8 8";
						visible = "1";
						hideCursor = "0";
						bypassHideCursor = "0";
						helpTag = "0";
						enumerate = "0";
						resizeCell = "1";
						columns = "0";
						fitParentWidth = "1";
						clipColumnText = "0";
					};
				};
			};
			new ShellBitmapButton(practiceSubmitBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "42 91";
				extent = "105 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceSubmit();";
				accelerator = "return";
				helpTag = "0";
				text = "SUBMIT";
				simpleStyle = "0";
			};
		};
		new ShellFieldCtrl(projectileBorder) {
			profile = "ShellFieldProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "20 190";
			extent = "448 42";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new GuiMLTextCtrl(projectileStr) {
				profile = "GuiDefaultProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "173 1";
				extent = "113 14";
				minExtent = "8 8";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				lineSpacing = "2";
				allowColorChars = "0";
				maxChars = "-1";
				deniedSound = "InputDeniedSound";
			};
			new ShellToggleButton(observeDiscBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "2 12";
				extent = "108 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(40);";
				helpTag = "0";
				text = "DISC";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(observeGLBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "112 12";
				extent = "108 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(41);";
				helpTag = "0";
				text = "GRENADE L.";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(observeMortarBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "222 12";
				extent = "108 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(42);";
				helpTag = "0";
				text = "MORTAR";
				longTextBuffer = "0";
				maxLength = "255";
			};
			new ShellToggleButton(observeMissileBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "332 12";
				extent = "108 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(43);";
				helpTag = "0";
				text = "MISSILE L.";
				longTextBuffer = "0";
				maxLength = "255";
			};
		};
		new ShellFieldCtrl(teleBorder) {
			profile = "ShellFieldProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "20 237";
			extent = "225 107";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new GuiMLTextCtrl(teleStr) {
				profile = "GuiDefaultProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "76 1";
				extent = "83 14";
				minExtent = "8 8";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				lineSpacing = "2";
				allowColorChars = "0";
				maxChars = "-1";
				deniedSound = "InputDeniedSound";
			};
			new ShellRadioButton(BeaconModeBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "2 12";
				extent = "108 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(20);";
				helpTag = "0";
				text = "BEACON MODE";
				longTextBuffer = "0";
				maxLength = "255";
				groupNum = "1";
			};
			new ShellRadioButton(TelepadModeBtn) {
				profile = "ShellRadioProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "112 12";
				extent = "107 30";
				minExtent = "26 27";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(21);";
				helpTag = "0";
				text = "TELEPAD MODE";
				longTextBuffer = "0";
				maxLength = "255";
				groupNum = "1";
			};
			new ShellBitmapButton(SelectBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "60 37";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(22);";
				accelerator = "return";
				helpTag = "0";
				text = "SELECT";
				simpleStyle = "0";
			};
			new ShellBitmapButton(DestroyBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "5 67";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(23);";
				accelerator = "return";
				helpTag = "0";
				text = "DESTROY";
				simpleStyle = "0";
			};
			new ShellBitmapButton(TeleportBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "113 67";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(24);";
				accelerator = "return";
				helpTag = "0";
				text = "TELEPORT";
				simpleStyle = "0";
			};
		};
		new ShellFieldCtrl(SpawnVehBorder) {
			profile = "ShellFieldProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "256 237";
			extent = "212 107";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new GuiMLTextCtrl(spawnVehStr) {
				profile = "GuiDialogProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "58 2";
				extent = "115 14";
				minExtent = "8 8";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				lineSpacing = "2";
				allowColorChars = "0";
				maxChars = "-1";
				deniedSound = "InputDeniedSound";
			};
			new ShellBitmapButton(spawnVehBtn1) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "2 12";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(30);";
				helpTag = "0";
				text = "WILDCAT";
				simpleStyle = "0";
			};
			new ShellBitmapButton(spawnVehBtn2) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "2 42";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(31);";
				helpTag = "0";
				text = "BEOWULF";
				simpleStyle = "0";
			};
			new ShellBitmapButton(spawnVehBtn3) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "2 72";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(32);";
				helpTag = "0";
				text = "JERICHO";
				simpleStyle = "0";
			};
			new ShellBitmapButton(spawnVehBtn4) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "102 12";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(33);";
				helpTag = "0";
				text = "SHRIKE";
				simpleStyle = "0";
			};
			new ShellBitmapButton(spawnVehBtn5) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "102 42";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(34);";
				helpTag = "0";
				text = "THUNDERSWORD";
				simpleStyle = "0";
			};
			new ShellBitmapButton(spawnVehBtn6) {
				profile = "ShellButtonProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "102 72";
				extent = "108 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "practiceServerBtns(35);";
				helpTag = "0";
				text = "HAVOC";
				simpleStyle = "0";
			};
		};
		new ShellBitmapButton(closeBtn) {
			profile = "ShellButtonProfile";
			horizSizing = "left";
			vertSizing = "bottom";
			position = "190 343";
			extent = "120 38";
			minExtent = "32 38";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "HidePracticeHud();";
			accelerator = "return";
			helpTag = "0";
			text = "CLOSE";
			simpleStyle = "0";
		};
		new GuiMLTextCtrl(serverHudStr) {
			profile = "ShellMediumTextProfile";
			horizSizing = "center";
			vertSizing = "bottom";
			position = "192 25";
			extent = "104 18";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new GuiMLTextCtrl(playerHudStr) {
			profile = "ShellMediumTextProfile";
			horizSizing = "center";
			vertSizing = "bottom";
			position = "192 171";
			extent = "104 18";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
	};
   };
}

////////////////////////////////////////////////////////////////////////////////////////
// Callbacks ///////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function handleActivatePracticeHud()
{
   if(!$PracticeHudCreated)
   {
      CreatePracticeHud();
      $PracticeHudCreated = 1;
   }
}

function handleInitPracHud(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
   if($practiceHudCreated)
      commandToServer('practiceHudInitialize', true);
}

function updatePracHud(%msgType, %msgString, %a1, %a2, %a3)
{
   // set hud sensitivity
   if(%a3 $= "")
      %val = 0;
   else
      %val = (%a3 > 0);
   UnlimAmmoBtn.setactive(%val);
   AutoReturnBtn.setactive(%val);
   spawnInFavsBtn.setactive(%val);
   SpawnOnlyBtn.setactive(%val);
   NoScoreLimitBtn.setactive(%val);
   ProtectAssestsBtn.setactive(%val);
   ResetMapBtn.setactive(%val);
   practiceOptionMenu.setActive(%val);
   practiceSubmitBtn.setactive(%val);

   // set hud values
   UnlimAmmoBtn.setvalue(%a1 & 1);
   AutoReturnBtn.setvalue(%a1 & 2);
   spawnInFavsBtn.setvalue(%a1 & 4);
   SpawnOnlyBtn.setvalue(%a1 & 8);
   NoScoreLimitBtn.setvalue(%a1 & 16);
   ProtectAssestsBtn.setvalue(%a1 & 32);
   observeDiscBtn.setvalue(%a2 & 1);
   observeGLBtn.setvalue(%a2 & 2);
   observeMortarBtn.setvalue(%a2 & 4);
   observeMissileBtn.setvalue(%a2 & 8);
   BeaconModeBtn.setvalue(%a2 & 16);
   TelepadModeBtn.setvalue(%a2 & 32);
}

addMessageCallback('MsgClientJoin', handleActivatePracticeHud);
addMessageCallback('MsgClientReady', handleInitPracHud);
addMessageCallback('MsgStripAdminPlayer', updatePracHud);
addMessageCallback('UpdatePracHud', updatePracHud);
addMessageCallback('MsgAdminPlayer', updatePracHud);
addMessageCallback('MsgAdminAdminPlayer', updatePracHud);
addMessageCallback('MsgSuperAdminPlayer', updatePracHud);
addMessageCallback('MsgAdminForce', updatePracHud);

////////////////////////////////////////////////////////////////////////////////////////

// Get the headings from the server
function clientCMDpracticeHudHead(%head, %server, %player, %projectile, %tele, %vehicle)
{
   practiceHudGui.settitle(%head);
   serverHudStr.setvalue(%server);
   playerHudStr.setvalue(%player);
   projectileStr.setvalue(%projectile);
   teleStr.setvalue(%tele);
   spawnVehStr.setvalue(%vehicle);
}

function clientCMDpracticeHudDone()
{
   $practiceArray[curopt] = 1;
   practiceOptionMenu.clear();
   for(%z = 1; %z <= $practiceArray[index]; %z++)
   {
      %nam = $practiceArray[%z, nam];
      practiceOptionMenu.add(%nam, %z);
   }
   practiceOptionMenu.setSelected($practiceArray[curopt]);
   practiceArrayCallOption($practiceArray[curopt]);
}

function practiceArrayCallOption(%opt)
{
   practiceSetList.clear();
   for(%x = 1; %x <= $practiceArray[%opt, noa]; %x++)
   {
      %nam = $practiceArray[%opt, %x];
      practiceSetList.addRow(%x, %nam);
   }
   %cur = $practiceArray[%opt, cur];
   practiceSetList.setSelectedByID(%cur);
}

function clientCMDinitializePracHud(%mode)
{
   for(%i = 0; $ModArray[%i, nam] !$= ""; %i++)
   {
      $practiceArray[%i, cur] = "";
      $practiceArray[%i, nam] = "";
      $practiceArray[%i, noa] = "";
      for(%j = 0; %j < 10; %j++)
         $practiceArray[%i, %j] = "";
   }
   $practiceArray[index] = 0;
   $practiceArray[curmode] = %mode;
}

function clientCMDpracticeHudPopulate(%opt, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10, %a11, %a12, %a13, %a14, %a15)
{
   %s[1] = %a1;
   %s[2] = %a2;
   %s[3] = %a3;
   %s[4] = %a4;
   %s[5] = %a5;
   %s[6] = %a6;
   %s[7] = %a7;
   %s[8] = %a8;
   %s[9] = %a9;
   %s[10] = %a10;
   %s[11] = %a11;
   %s[12] = %a12;
   %s[13] = %a13;
   %s[14] = %a14;
   %s[15] = %a15;
   $practiceArray[index]++;
   $practiceArray[curopt] = $practiceArray[index];
   %cur = $practiceArray[curopt];
   $practiceArray[%cur, cur] = "";
   $practiceArray[%cur, nam] = %opt;
   while(%s[%z++] !$= "")
   {
      $practiceArray[%cur, %z] = %s[%z];
   }
   $practiceArray[%cur, cur] = "1";
   $practiceArray[%cur, noa] = %z-1;
}

function practiceSetList::onSelect(%this, %id, %text)
{
   $practiceArray[$practiceArray[curopt], cur] = %id;
}

function practiceOptionMenu::onSelect(%this, %id, %text)
{
   $practiceArray[curopt] = %id;
   practiceArraycallOption(%id);
}

function ShowPracticeHud()
{
   if($thisMissionType $= "PracticeCTFGame")
   {
      commandToServer('needPracHudUpdate', %opt);
      canvas.pushdialog(practiceHud);
      $practiceHudOpen = 1;
   }
}

function HidePracticeHud()
{
   canvas.popdialog(practiceHud);
   $practiceHudOpen = 0;
}

function practiceHud::onWake( %this )
{
   if ( isObject( practiceHudMap ) )
   {
      practiceHudMap.pop();
      practiceHudMap.delete();
   }
   new ActionMap( practiceHudMap );
   practiceHudMap.blockBind( moveMap, toggleModHud );
   practiceHudMap.blockBind( moveMap, toggleAdminHud );
   practiceHudMap.blockBind( moveMap, toggleInventoryHud );
   practiceHudMap.blockBind( moveMap, toggleScoreScreen );
   practiceHudMap.blockBind( moveMap, toggleCommanderMap );
   practiceHudMap.bindCmd( keyboard, escape, "", "HidePracticeHud();" );
   practiceHudMap.push();
}

function practiceHud::onSleep( %this )
{
   %this.callback = "";
   practiceHudMap.pop();
   practiceHudMap.delete();
}

////////////////////////////////////////////////////////////////////////////////////////
// Button functions ////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function practiceServerBtns(%opt)
{
   switch(%opt)
   {
      case 40:
         %val = observeDiscBtn.getValue();
      case 41:
         %val = observeGLBtn.getValue();
      case 42:
         %val = observeMortarBtn.getValue();
      case 43:
         %val = observeMissileBtn.getValue();
      default:
         %val = "";
   }
   commandToServer('practiceBtnCall', %opt, %val);
}

function practiceSubmit()
{
   // Send the currently selected option and setting to the server
   commandToServer('practiceUpdateSettings', $practiceArray[curopt], $practiceArray[$practiceArray[curopt], cur]);
}
