////////////////////////////////////////////////////////////////////////////////////////
// z0dd - ZOD: ADMIN HUD ///////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function CreateAdminHud()
{
	$AdminHudId = new GuiControl(AdminHudDlg) {
		profile = "GuiDialogProfile";
		horizSizing = "width";
		vertSizing = "height";
		position = "0 0";
		extent = "640 480";
		minExtent = "8 8";
		visible = "1";
		helpTag = "0";

		new ShellPaneCtrl() {
			profile = "ShellDlgPaneProfile";
			horizSizing = "center";
			vertSizing = "center";
			position = "170 137";
			extent = "320 260";
			minExtent = "48 92";
			visible = "1";
			helpTag = "0";
			text = "Admin Hud";
			noTitleBar = "0";

			// -- Drop down menu text label
			new GuiTextCtrl() {
				profile = "ShellTextRightProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "10 52";
				extent = "50 22";
				minExtent = "8 8";
				visible = "1";
				helpTag = "0";
				text = "Menu:";
			};
			// -- Drop down menu
			new ShellPopupMenu(AdminHudMenu) {
				profile = "ShellPopupProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 44";
				extent = "225 38";
				minExtent = "49 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				text = "- OPTIONS -";
				maxLength = "255";
				maxPopupHeight = "200";
				buttonBitmap = "gui/shll_pulldown";
				rolloverBarBitmap = "gui/shll_pulldownbar_rol";
				selectedBarBitmap = "gui/shll_pulldownbar_act";
				noButtonStyle = "0";
			};
			// -- Input text field label
			new GuiTextCtrl() {
				profile = "ShellTextRightProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "10 88";
				extent = "50 22";
				minExtent = "8 8";
				visible = "1";
				helpTag = "0";
				text = "Input:";
			};
			// -- Input text field
			new ShellTextEditCtrl(AdminHudInput) {
				profile = "NewTextEditProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 80";
				extent = "225 38";
				minExtent = "32 38";
				visible = "1";
				command = "AdminHudInput.setField();";
				altCommand = "AdminHudInput.processEnter();";
				helpTag = "0";
				historySize = "0";
				maxLength = "127";
				password = "0";
				glowOffset = "9 9";
			};
			// -- Cancel button
			new ShellBitmapButton(AdminHudCancelBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "60 118";
				extent = "120 38";
				minExtent = "32 38";
				visible = "1";
				command = "HideAdminHud();";
				accelerator = "escape";
				helpTag = "0";
				text = "CANCEL";
				simpleStyle = "0";
			};
			// -- Send button
			new ShellBitmapButton(AdminHudSendBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "165 118";
				extent = "120 38";
				minExtent = "32 38";
				visible = "1";
				command = "AdminHudSendBtn.adminCommand();";
				helpTag = "0";
				text = "SEND";
				simpleStyle = "0";
			};
			// -- Clan Tag drop down menu text label
			new GuiTextCtrl() {
				profile = "ShellTextRightProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "10 173";
				extent = "50 22";
				minExtent = "8 8";
				visible = "1";
				helpTag = "0";
				text = "Tags:";
			};
			// -- Clan Tag drop down menu
			new ShellPopupMenu(ClanTagHudMenu) {
				profile = "ShellPopupProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "60 165";
				extent = "225 38";
				minExtent = "49 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				text = "- CLAN TAGS -";
				maxLength = "255";
				maxPopupHeight = "200";
				buttonBitmap = "gui/shll_pulldown";
				rolloverBarBitmap = "gui/shll_pulldownbar_rol";
				selectedBarBitmap = "gui/shll_pulldownbar_act";
				noButtonStyle = "0";
			};
			new ShellBitmapButton(ClanTagSendBtn) {
				profile = "ShellButtonProfile";
				horizSizing = "left";
				vertSizing = "bottom";
				position = "60 200";
				extent = "225 38";
				minExtent = "32 38";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				command = "ClanTagSendBtn.sendTagCommand();";
				helpTag = "0";
				text = "CHANGE CLAN TAG";
				simpleStyle = "0";
			};
		};
	};
   ClanTagSendBtn.setActive(0);
}

function handleActivateAdminHud()
{
   if(!$AdminHudCreated)
   {
      CreateAdminHud(); // Create the gui
      UpdateAdminHudMenu(); // Fill the drop down menu
      $AdminHudCreated = 1; // Set the flag
   }
}

addMessageCallback('MsgClientJoin', handleActivateAdminHud);

function ShowAdminHud()
{
   canvas.pushdialog(AdminHudDlg);
   //clientCmdTogglePlayHuds(false);
   $AdminHudOpen = 1;
}

function HideAdminHud()
{
   // Empty out the text input field
   AdminHudInput.setValue(%empty);

   canvas.popdialog(AdminHudDlg);
   $AdminHudOpen = 0;
   //clientCmdTogglePlayHuds(true);
}

function AdminHudDlg::onWake( %this )
{
   if ( isObject( AdminHudMap ) )
   {
      AdminHudMap.pop();
      AdminHudMap.delete();
   }
   new ActionMap( AdminHudMap );
   AdminHudMap.blockBind( moveMap, toggleModHud );
   AdminHudMap.blockBind( moveMap, togglePracticeHud );
   AdminHudMap.blockBind( moveMap, toggleInventoryHud );
   AdminHudMap.blockBind( moveMap, toggleScoreScreen );
   AdminHudMap.blockBind( moveMap, toggleCommanderMap );
   AdminHudMap.bindCmd( keyboard, escape, "", "HideAdminHud();" );
   AdminHudMap.push();
}

function AdminHudDlg::onSleep( %this )
{
   %this.callback = "";
   AdminHudMap.pop();
   AdminHudMap.delete();
}

function UpdateAdminHudMenu()
{
   // Populate the drop down menu with options seperated by \t (tab deliniated list).
   %line1 = "Choose Option\tEnter Admin Password\tEnter Super Admin Password\tSet Join Password\tSet Admin Password\tSet Super Admin Password";
   %line2 = "\tSet Random Teams\tSet Fair Teams\tSet Max Players\tSet Auto-PW\tSet Auto-PW Password\tSet Auto-PW Count\tSend Bottomprint Message";
   %line3 = "\tSend Centerprint Message\tRemove Map From Rotation\tRestore Map To Rotation\tRemove GameType\tRestore GameType\tRestart Server\tConsole Command";
   %opt = %line1 @ %line2 @ %line3;
   AdminHudMenu.hudSetValue(%opt, "");
   // Update the Clan Tag drop down menu as well
   commandToServer('canGetClanTags');
}

function AdminHudMenu::onSelect(%this, %id, %text)
{
   // Called when an option is selected in drop down menu
   $AdminMenu = %this.getValue();
}

function AdminHudInput::setField( %this )
{
   // called when you type in text input field
   %value = %this.getValue();
   %this.setValue( %value );
   $AdminInput = %value;
   //AdminHudSendBtn.setActive( strlen( stripTrailingSpaces( %value ) ) >= 1 );
}

function AdminHudInput::processEnter( %this )
{
   // Called when you press enter in text input field
}

function AdminHudSendBtn::adminCommand( %this )
{
   // Called when you press the send button

   // Update the global from the text input field
   AdminHudInput.setField();

   // Send the current menu selection and text to the server
   switch$ ( $AdminMenu )
   {
      case "Enter Admin Password":
         commandToServer('SAD', $AdminInput);

      case "Enter Super Admin Password":
         commandToServer('SAD', $AdminInput);

      case "Set Join Password":
         commandToServer('Set', "joinpw", $AdminInput);

      case "Set Admin Password":
         commandToServer('Set', "adminpw", $AdminInput);

      case "Set Super Admin Password":
         commandToServer('Set', "superpw", $AdminInput);

      case "Set Random Teams":
         commandToServer('Set', "random", $AdminInput);

      case "Set Fair Teams":
         commandToServer('Set', "fairteams", $AdminInput);

      case "Set Max Players":
         commandToServer('Set', "maxplayers", $AdminInput);

      case "Set Auto-PW":
         commandToServer('AutoPWSetup', "autopw", $AdminInput);

      case "Set Auto-PW Password":
         commandToServer('AutoPWSetup', "autopwpass", $AdminInput);

      case "Set Auto-PW Count":
         commandToServer('AutoPWSetup', "autopwcount", $AdminInput);

      case "Send Bottomprint Message":
         commandToServer('aprint', $AdminInput, true);

      case "Send Centerprint Message":
         commandToServer('aprint', $AdminInput, false);

      case "Remove Map From Rotation":
         commandToServer('AddMap', $AdminInput);

      case "Restore Map To Rotation":
         commandToServer('RemoveMap', $AdminInput);

      case "Remove GameType":
         commandToServer('AddType', $AdminInput);

      case "Restore GameType":
         commandToServer('RemoveType', $AdminInput);

      case "Restart Server":
         commandToServer('Set', "restart", $AdminInput);

      case "Console Command":
         commandToServer('Set', "consolecmd", $AdminInput);

      default:
         error("Admin Hud selected option: " @ $AdminMenu @ " input: " @ $AdminInput @ " unknown values.");
   }

   // Clear the text input field and disable send button
   //AdminHudSendBtn.setActive(0);
   AdminHudInput.setValue(%empty);
   UpdateAdminHudMenu();
   $AdminInput = "";
   $AdminMenu = "";
}

////////////////////////////////////////////////////////////////////////////////////////
// Canadian, 7/19/03. Clan Tag switiching //////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function ClanTagHudMenu::onSelect(%this, %id, %text)
{
   // Called when an option is selected in drop down menu
   $CanSelected = %this.getValue();
   ClanTagSendBtn.setActive(1);
}

function ClanTagSendBtn::sendTagCommand( %this )
{
   // Called when you press the send button
   // Send the current menu selection and text to the server
   commandToServer('canUpdateClanTag', $CanSelected);
   $CanSelected = "";
   HideAdminHud();
}

function clientCmdcanDisplayTags(%tags)
{
   ClanTagHudMenu.hudSetValue(%tags, "");
}
