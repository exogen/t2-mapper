// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Krash & Electricutioner/Thyth
// Copyright 2008-2009 by Electricutioner/Thyth, and the Tribes 2 Community System Reengineering Intitiative

// Login UIs and Account processing jumble.

$LastLoginKey = $pref::LastLoginKey;
exec("scripts/commonDialogs.cs");
exec("gui/MessageBoxDlg.gui");
exec("t2csri/glue.cs");

      // Begin UI replacements:
      new GuiBitmapCtrl(TN_logo)
      {
         profile = "GuiDefaultProfile";
         horizSizing = "center";
         vertSizing = "top";
         bitmap = "TN_logo";
         position = "0 20";
         extent = "640 105";
         visible = true;
	     minExtent = "8 8";
	     helpTag = "0";
      };
      new GuiControlProfile(noMoreModal)
      {
         modal = false;
      };
      new GuiControlProfile (ShellTextCenterProfile)
      {
         fontType = "Univers Condensed";
         fontSize = 18;
         fontColor = "66 229 244";
         justify = "center";
         autoSizeWidth = false;
         autoSizeHeight = true;
         Modal = false;
      };
      new GuiControlProfile (ShellTextLeftProfile)
      {
         fontType = "Univers Condensed";
         fontSize = 18;
         fontColor = "66 229 244";
         justify = "left";
         autoSizeWidth = false;
         autoSizeHeight = true;
         Modal = false;
      };
      
      new GuiControl(CreateAccountDlg) {
         profile = "GuiDefaultProfile";
         horizSizing = "right";
         vertSizing = "bottom";
         position = "0 0";
         extent = "640 480";
         minExtent = "8 8";
         visible = "1";
         helpTag = "0";
            open = "0";

         new ShellPaneCtrl(TitleBar) {
            profile = "ShellDlgPaneProfile";
            horizSizing = "center";
            vertSizing = "center";
            position = "70 36";
            extent = "500 408";
            minExtent = "48 92";
            visible = "1";
            helpTag = "0";
            text = "Create Account - Step 1 of 3";
            noTitleBar = "0";


            new GuiControlProfile ("BrowserH1Profile")
            {
               fontType = "Univers Condensed Bold";
               fontSize = 28;
               fontColor = "66 219 234";
               autoSizeWidth = false;
               autoSizeHeight = true;
               bitmapBase = "gui/shll";
            };
			new GuiBitmapCtrl(tn_EntropyBox) {
				profile = "GuiDefaultProfile";
				horizSizing = "center";
				vertSizing = "bottom";
				position = "37 84";
				extent = "440 188";
				minExtent = "8 8";
				visible = "1";
				helpTag = "0";

				new GuiMouseEventCtrl(tn_EntropyEvent)
				{
				   profile = "DefaultProfile";
				   position = "0 0";
				   extent = "440 188";
				   vertSizing = "top";
				   horizSizing = "left";
				   visible = "true";
				};
            };

            new GuiMLTextCtrl(AccountInstructions) {
               profile = "BrowserH1Profile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "26 34";
               extent = "390 14";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               lineSpacing = "2";
            };
            new GuiMLTextCtrl(AccountText) {
               profile = "ShellMessageTextProfile";
               horizSizing = "width";
               vertSizing = "height";
               position = "26 74";
               extent = "445 16";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               lineSpacing = "-2";
            };
            new GuiTextCtrl(CN_keyName) {
               profile = "ShellTextRightProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "35 128";
               extent = "100 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "Key Details:";
            };
            new GuiMLTextCtrl(CA_keyName) {
               profile = "ShellTextLeftProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "141 128";
               extent = "200 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "";
            };
            new GuiTextCtrl(CN_userName) {
               profile = "ShellTextRightProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "35 174";
               extent = "100 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "Account Name:";
            };
            new GuiTextCtrl(CN_chooPass) {
               profile = "ShellTextRightProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "35 220";
               extent = "100 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "Password:";
            };
            new GuiTextCtrl(CN_confPass) {
               profile = "ShellTextRightProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "35 250";
               extent = "100 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "Confirm Password:";
            };
            new ShellTextEditCtrl(CA_userName) {
               profile = "NewTextEditProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "131 166";
               extent = "180 38";
               minExtent = "32 38";
               visible = "1";
               variable = "$CreateAccountLoginName";
               command = "CA_userName.validateWarriorName();";
               IRCName = true;
               helpTag = "0";
               historySize = "0";
               maxLength = "16";
               password = "0";
               glowOffset = "9 9";
            };
            new ShellTextEditCtrl(CA_chooPass) {
               profile = "NewTextEditProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "131 212";
               extent = "180 38";
               minExtent = "32 38";
               visible = "1";
               variable = "$CreateAccountPassword";
               helpTag = "0";
               historySize = "0";
               maxLength = "255";
               password = "1";
               glowOffset = "9 9";
            };
            new ShellTextEditCtrl(CA_confPass) {
               profile = "NewTextEditProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "131 242";
               extent = "180 38";
               minExtent = "32 38";
               visible = "1";
               variable = "$CreateAccountConfirmPassword";
               helpTag = "0";
               historySize = "0";
               maxLength = "255";
               password = "1";
               glowOffset = "9 9";
            };
            new ShellBitmapButton(CreateAccountPrevBtn) {
               profile = "ShellButtonProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "72 351";
               extent = "128 38";
               minExtent = "32 38";
               visible = "1";
               command = "CreateAccountDlg.nextBtn(1);";
               accelerator = "escape";
               helpTag = "0";
               text = "CANCEL";
               simpleStyle = "0";
            };
		    new GuiTextCtrl(CN_strength) {
               profile = "ShellTextRightProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "37 288";
               extent = "85 22";
               minExtent = "8 8";
               visible = "1";
               helpTag = "0";
               text = "Strength:";
               maxLength = "255";
		    };
		    new ShellPopupMenu(CA_strength) {
               profile = "ShellPopupProfile";
               horizSizing = "right";
			   vertSizing = "bottom";
			   position = "118 280";
			   extent = "140 38";
			   minExtent = "32 38";
               visible = "1";
			   hideCursor = "0";
			   bypassHideCursor = "0";
               text = "RSA-512";
			   helpTag = "0";
			   glowOffset = "9 9";
			   maxLength = "255";
               longTextBuffer = "0";
			   maxPopupHeight = "200";
			   buttonBitmap = "gui/shll_pulldown";
			   rolloverBarBitmap = "gui/shll_pulldownbar_rol";
			   selectedBarBitmap = "gui/shll_pulldownbar_act";
			   noButtonStyle = "0";
		    };
            new ShellBitmapButton(CreateAccountGenBtn) {
               profile = "ShellButtonProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "250 280";
               extent = "189 38";
               minExtent = "32 38";
               visible = "1";
               command = "CreateAccountDlg.genBtn();";
               helpTag = "1";
               text = "GENERATE YOUR KEY";
               simpleStyle = "0";
            };
            new GuiMLTextCtrl(HintText) {
               profile = "ShellTextCenterProfile";
               horizSizing = "width";
               vertSizing = "height";
               position = "125 255";
               extent = "445 16";
               minExtent = "8 8";
               visible = "1";
               helpTag = "1";
               lineSpacing = "-2";
            };
		    new GuiTextCtrl(HintText2) {
			      profile = "ShellTextCenterProfile";
			      horizSizing = "center";
			      vertSizing = "bottom";
			      position = "0 315";
			      extent = "445 22";
			      minExtent = "8 8";
			      visible = "1";
			      helpTag = "0";
			      text = "Click the above button to proceed.";
			      maxLength = "255";
		    };
            new ShellBitmapButton(CreateAccountNextBtn) {
               profile = "ShellButtonProfile";
               horizSizing = "right";
               vertSizing = "bottom";
               position = "282 351";
               extent = "128 38";
               minExtent = "32 38";
               visible = "1";
               command = "CreateAccountDlg.nextBtn();";
               helpTag = "0";
               text = "NEXT STEP";
               simpleStyle = "0";
            };
         };
      };

      // Modified Login dlg
      new GuiControl(LoginDlg) {
	      profile = "GuiDefaultProfile";
	      horizSizing = "right";
	      vertSizing = "bottom";
	      position = "0 0";
	      extent = "640 480";
	      minExtent = "8 8";
	      visible = "1";
	      helpTag = "0";

	      new ShellPaneCtrl() {
		      profile = "ShellDlgPaneProfile";
		      horizSizing = "center";
		      vertSizing = "top";
		      position = "72 143";
		      extent = "495 194";
		      minExtent = "48 92";
		      visible = "1";
		      helpTag = "0";
		      text = "LOGIN";
		      maxLength = "255";
		      noTitleBar = "0";

		      new GuiTextCtrl(accnTxt) {
			      profile = "ShellTextRightProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "37 77";
			      extent = "85 22";
			      minExtent = "8 8";
			      visible = "1";
			      helpTag = "0";
			      text = "Account:";
			      maxLength = "255";
		      };
		      new ShellPopupMenu(LoginEditMenu) {
			      profile = "ShellPopupProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "118 69";
			      extent = "180 38";
			      minExtent = "32 38";
                  visible = "1";
			      hideCursor = "0";
			      bypassHideCursor = "0";
                  text = "Select Account";
			      helpTag = "0";
			      glowOffset = "9 9";
			      maxLength = "255";
                  longTextBuffer = "0";
			      maxPopupHeight = "200";
			      buttonBitmap = "gui/shll_pulldown";
			      rolloverBarBitmap = "gui/shll_pulldownbar_rol";
			      selectedBarBitmap = "gui/shll_pulldownbar_act";
			      noButtonStyle = "0";
		      };
		      new ShellTextEditCtrl(LoginEditBox) {
			      profile = "NewTextEditProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "118 99";
			      extent = "180 38";
			      minExtent = "32 38";
			      visible = "1";
			      variable = "$LoginName";
			      altCommand = "newLoginProcess();";
			      helpTag = "0";
			      maxLength = "16";
			      historySize = "0";
			      password = "0";
			      glowOffset = "9 9";
		      };
		      new GuiTextCtrl() {
                  profile = "ShellTextLeftProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "37 29";
			      extent = "420 22";
			      minExtent = "8 8";
			      visible = "1";
			      helpTag = "0";
			      text = "Use the form below to log in with an existing key, retrieve a login key, or create";
			      maxLength = "255";
		      };
		      new GuiTextCtrl() {
                  profile = "ShellTextLeftProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "37 45";
			      extent = "420 22";
			      minExtent = "8 8";
			      visible = "1";
			      helpTag = "0";
			      text = "a new account on the server.";
			      maxLength = "255";
		      };
		      new GuiTextCtrl(passTxt) {
			      profile = "ShellTextRightProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "37 107";
			      extent = "85 22";
			      minExtent = "8 8";
			      visible = "1";
			      helpTag = "0";
			      text = "Password:";
			      maxLength = "255";
		      };
		      new GuiLoginPasswordCtrl(LoginPasswordBox) {
			      profile = "NewTextEditProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "118 99";
			      extent = "180 38";
			      minExtent = "32 38";
			      visible = "1";
			      variable = "$LoginPassword";
			      altCommand = "newLoginProcess();";
			      helpTag = "0";
			      maxLength = "255";
			      historySize = "0";
			      password = "1";
			      glowOffset = "9 9";
		      };
		      new ShellToggleButton(rmbrPass) {
			      profile = "ShellRadioProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "122 134";
			      extent = "167 27";
			      minExtent = "26 27";
			      visible = "1";
			      variable = "$pref::RememberPassword";
			      helpTag = "0";
			      text = "REMEMBER PASSWORD";
			      maxLength = "255";
		      };
		      new ShellBitmapButton() {
			      profile = "ShellButtonProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "300 69";
			      extent = "147 38";
			      minExtent = "32 38";
			      visible = "1";
			      command = "newLoginProcess();";
			      helpTag = "0";
			      text = "LOG IN";
			      simpleStyle = "0";
		      };
		      new ShellBitmapButton() {
			      profile = "ShellButtonProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "300 99";
			      extent = "147 38";
			      minExtent = "32 38";
			      visible = "1";
			      command = "newCreateAccount();";
			      helpTag = "0";
			      text = "CREATE NEW ACCOUNT";
			      simpleStyle = "0";
		      };
		      new ShellBitmapButton() {
			      profile = "ShellButtonProfile";
			      horizSizing = "right";
			      vertSizing = "bottom";
			      position = "300 129";
			      extent = "147 38";
			      minExtent = "32 38";
			      visible = "1";
			      command = "quit();";
			      accelerator = "escape";
			      helpTag = "0";
			      text = "QUIT";
			      simpleStyle = "0";
		      };
	      };
      };

      // Add these to the StartupGui to make sure everything gets cleaned up.
      StartupGui.add(TN_logo);
      StartupGui.add(ShellTextCenterProfile);
      StartupGui.add(ShellTextLeftProfile);
      StartupGui.add(noMoreModal);
      // End UI replacements



// Fill the drop-down list
function CA_strength::populate(%this) {
	%this.add( "RSA-512", 0 );
	%this.add( "RSA-768", 1 );
	%this.add( "RSA-1024", 2 );
	%this.setSelected( 0 );
	%this.onSelect( 0, "RSA-512" );
}
function CA_strength::onSelect( %this, %id, %text ) {
	$keyStrength = %text;
	%this.setText( %text );
	if (CreateAccountDlg.page != 2) return;
	switch (%id) {
		case 0:
		  %time = 2;
		case 1:
		  %time = 3;
		case 2:
		  %time = 7;
	}
	HintText2.setText("Your key could take up to "@%time@" minutes to create.");
}
function LoginEditMenu::populate(%this) {
	%this.add( "Retrieve Account", 0 );

	// LoginEditMenu.add( %name, %id );
	// Make sure to index keys to the number in the menu.  0 is used for key download.
	// Use LoginEditMenu.size() for current length.
	//
	// When a new key is downloaded through t2csri_downloadAccount, try to have it use
	// the setSelected/onSelect functions after adding to make the new field current and default

	// pull the list of accounts from the Ruby certificate store
	rubyEval("tsEval '$accountList = \"' + certstore_listAccounts + '\";'");
	
	%count = 0;
	%accounts = getFieldCount($accountList);
	for (%i = 0; %i < %accounts; %i++)
	{
		%this.add(getField($accountList, %i), %count++);
	}
 
	if (%count < 1) %this.setActive(0);
	%id = %this.findText( $LastLoginKey );
	if ( %id == -1 )
		%id = 0;
	%text = %this.getTextById(%id);
	%this.setSelected( %id );
	%this.onSelect( %id, %text );

	// populate the game's alias selections for post-login
	for (%i = 0; %i < %accounts; %i++)
	{
		%present = 0;
		for (%j = 0; %j < $pref::Player::Count; %j++)
		{
			if (getField($pref::Player[%j], 0) $= getField($accountList, %i))
				%present = 1;
		}
		if (!%present)
		{
			$pref::Player[$pref::Player::Count] = getField($accountList, %i) @ "\tHuman Male\tbeagle\tMale1";
			$pref::Player::Count++;
		}
	}
}

// Make sure everything is in the right place when an option is selected
function LoginEditMenu::onSelect( %this, %id, %text ) {
	if (%id == 0) {
		LoginPasswordBox.setPosition(118, 129);
		passTxt.setPosition(37, 137);
		accnTxt.setPosition(37, 107);
		rmbrPass.setVisible(0);
		LoginEditBox.setVisible(1);
	} else {
		LoginPasswordBox.setPosition(118, 99);
		passTxt.setPosition(37, 107);
		accnTxt.setPosition(37, 77);
		rmbrPass.setVisible(1);
		LoginEditBox.setVisible(0);
	}
	$LastLoginKey = %text;
	%this.setText( %text );
}
LoginEditMenu.populate();
// Track the open state, and disable the next button unless ready to go.
function CreateAccountDlg::onWake( %this )
{
	%this.open = true;
	tn_EntropyBox.setBitmap("TN_entropy");
	CreateAccountDlg.bringToFront(tn_EntropyEvent);
	// Check online status.
	Authentication_checkAvail();
	// If it's online, set %this.online to true.
	t2csri_checkOnlineStatusLoop(%this);
}
// this interfaces to the authentication interface script
function t2csri_checkOnlineStatusLoop(%this)
{
	// if no transaction to the authentication server is active...
	if ($Authentication::Status::ActiveMode == 0)
	{
		%this.online = $Authentication::Status::Available;
		CreateAccountNextBtn.setActive( false );
		updateNextButton(%this);
	}
	else
	{
		// otherwise, check again, as the transaction may still be in progress
		schedule(128, 0, t2csri_checkOnlineStatusLoop, %this);
	}
}

function CreateAccountDlg::onSleep( %this )
{
	%this.open = false;
}

// All the account creation page junk is sent through here.
function CreateAccountDlg::nextBtn(%this,%reverse) {
	CreateAccountNextBtn.setActive( false );
	%this.showFields[1] = false;
	%this.showFields[2] = false;
	%this.showFields[3] = false;
	if(%reverse) %this.page--;
	else %this.page++;
	
	%this.showFields[%this.page] = true;
	switch (%this.page) {
		case 1:
		  TitleBar.setText("Create Account - Step 1 of 3");
		  CreateAccountPrevBtn.setValue(" CANCEL");
		  CreateAccountNextBtn.setValue("NEXT STEP");
		  %hintText = "Please wait as the server status is checked.";
		  HintText2.setText(%hintText);
		  %headtext = "Step One: Account Server Status";
		  %body = "In order to create your account, the account server must be connectable.  If it's offline, you won't be able to pass this step.  \n\nIn step two, you will generate your unique key to ensure your account cannot be stolen.\n\nIn step three, you will choose your login information.";
		  AccountInstructions.setText(%headtext);
		  AccountText.setText(%body);
		  HintText.setVisible(1);
		  HintText.setPosition(125, 255);
		  HintText.setText("");
		  
		case 2:
		  TitleBar.setText("Create Account - Step 2 of 3");
		  %headtext = "Step Two: ";
		  %body = "";
		  AccountInstructions.setText(%headtext);
		  AccountText.setText(%body);
		  HintText.setVisible(1);
		  HintText.setPosition(120, 30);
		  HintText.setEntropyText();
		  %keyText = $keyCreated ? "KEY GENERATED" : "GENERATE YOUR KEY";
		  %active = (tn_EntropyEvent.finished && !$keyCreated) ? true : false;
          if (!%active) HintText2.setText("Click the NEXT STEP button to proceed.");
		  CreateAccountGenBtn.setValue(%keyText);
          CA_strength.setActive(%active);
          CreateAccountGenBtn.setActive(%active);
		  CreateAccountPrevBtn.setValue("BACK");
		  CreateAccountNextBtn.setValue("NEXT STEP");
		  if (!CA_strength.size()) CA_strength.populate();		  
          logEntropy();

		case 3:
		  TitleBar.setText("Create Account - Step 3 of 3");
		  %headtext = "Step Three: Choose Your Account Details";
		  %body = "Pick out your account details and confirm they are correct before registering your account.  Don't forget your password.";
		  CA_keyName.setText("Strength: "@$keyStrength);
		  AccountInstructions.setText(%headtext);
		  AccountText.setText(%body);
		  HintText.setVisible(0);
		  CreateAccountGenBtn.setVisible(0);
		  CreateAccountPrevBtn.setValue("BACK");
		  CreateAccountNextBtn.setValue("FINISH");
		  HintText.setVisible(1);
		  HintText.setPosition(100, 290);
		  HintText.setText("");
		  HintText2.setText("Fill out the above form to proceed.");

		  
		case 4:
		  // TODO:
		  // Send information to registration process:
		  //  $CreateAccountLoginName
		  //  $CreateAccountPassword
		  
		  LoginMessagePopup("PLEASE WAIT", "Registering Account with the Authentication Server...");
		  t2csri_requestAccountSignature(%this);
		  
		  
		default:
		  Canvas.popDialog( CreateAccountDlg );
		  Canvas.pushDialog( LoginDlg );
		  
	}
	CreateAccountGenBtn.setVisible(%this.showFields[2]);
	CN_strength.setVisible(%this.showFields[2]);
	CA_strength.setVisible(%this.showFields[2]);
	tn_EntropyBox.setVisible(%this.showFields[2]);
	CN_keyName.setVisible(%this.showFields[3]);
	CA_keyName.setVisible(%this.showFields[3]);
	CN_userName.setVisible(%this.showFields[3]);
	CA_userName.setVisible(%this.showFields[3]);
	CN_chooPass.setVisible(%this.showFields[3]);
	CA_chooPass.setVisible(%this.showFields[3]);
	CN_confPass.setVisible(%this.showFields[3]);
	CA_confPass.setVisible(%this.showFields[3]);
}

// ready to send the account to the server for processing, prepare it...
function t2csri_requestAccountSignature(%this)
{
	// pull the keys from the Ruby interpreter
	rubyEval("tsEval '$e=\"' + $accountKey.e.to_s(16) + '\";'");
	rubyEval("tsEval '$n=\"' + $accountKey.n.to_s(16) + '\";'");
	rubyEval("tsEval '$d=\"' + $accountKey.d.to_s(16) + '\";'");
	$encryptedExponent = t2csri_encryptAccountKey($d, $CreateAccountPassword);
	%authSHA = sha1sum("3.14159265" @ trim(strlwr($CreateAccountLoginName)) @ $CreateAccountPassword);
	%reqsig = $CreateAccountLoginName @ "\t" @ $e @ "\t" @ $n @ "\t" @ $encryptedExponent @ "\t" @ %authSHA;

	// delete the variables
	$e = "";
	$d = "";
	$n = "";

	// (RC2) perform a signature operation on the fields from the name to the end
	%requestSHA1 = sha1sum(%reqsig);
	rubyEval("tsEval '$requestRSA=\"' + $accountKey.decrypt('" @ %requestSHA1 @ "'.to_i(16)).to_s(16) + '\";'");
	%reqsig = %reqsig @ "\t" @ $requestRSA;

	//echo("Request: " @ %reqsig);
	$Authentication::Status::LastCert = "";
	Authentication_registerAccount(%reqsig);
	schedule(512, 0, t2csri_completeAccountRequest, %this);
}

function t2csri_completeAccountRequest(%this)
{
	// if no transaction to the authentication server is active...
	if ($Authentication::Status::ActiveMode == 0)
	{
		popLoginMessage();
		if (strLen($Authentication::Status::LastCert) > 0)
		{
			// success
			LoginMessagePopup("SUCCESS", "Account generated successfully. Storing account data to disk and logging in...");
			schedule(3000, 0, popLoginMessage);
			schedule(3000, 0, LoginDone);

			// store the account data to file
			%username = getField($Authentication::Status::LastCert, 0);
			rubyEval("certstore_addAccount('" @ $Authentication::Status::LastCert @ "','" @ %username @ "\t" @ $encryptedExponent @ "')");
			// protect the key... now that we have succeeded
			$LoginCertificate = $Authentication::Status::LastCert;
			rubyEval("$accountKey.protect");
		}
		else
		{
			// handle the error
			if ($Authentication::Status::Signature $= "Server chose to reject account generation request.")
			{
				LoginMessagePopup("ERROR", "The Authentication Server understood your request, but chose not to fulfill it.");
			}
			else if ($Authentication::Status::Signature $= "Server rejected account name.")
			{
				LoginMessagePopup("ERROR", "The Authentication Server rejected your requested account name.");
			}
			else if ($Authentication::Status::Signature $= "Corrupt signature request rejected.")
			{
				LoginMessagePopup("ERROR", "The server detected a problem in your request and could not create an account.");
			}
			else if ($Authentication::Status::Signature $= "Unknown signature status code returned from server.")
			{
				LoginMessagePopup("ERROR", "The Authentication Server timed out while fulfilling your request.");
			}
			// go back to the account page
			%this.nextBtn(1);
			// schedule a "pop" of the error box we just put up
			schedule(7000, 0, popLoginMessage);
		}
	}
	else
	{
		// otherwise, check again, as the transaction may still be in progress
		schedule(128, 0, t2csri_completeAccountRequest, %this);
	}
}

function HintText::setEntropyText( %this )
{
	if (tn_EntropyEvent.finished)
	{
		%lines = "1. Select your key strength.\n2. Click the generate button.";
		CreateAccountGenBtn.setActive(1);
		CA_strength.setActive(1);
		
	}
	else
	{
		if(tn_EntropyEvent.time $= "")
			tn_EntropyEvent.time = 80;
		%lines = (tn_EntropyEvent.hasMouse ? "<color:00ff00>":"<color:42e5f4>") @ "1. Move your mouse inside the big box.";
		%lines = %lines NL "<color:42e5f4>2. Wiggle it around for "@mCeil(tn_EntropyEvent.time / 8)@" more seconds.";
	}
	HintText.setText(%lines);
}
function tn_EntropyEvent::onMouseEnter(%this, %mod, %pos, %count)
{
	if (tn_EntropyEvent.finished)
		return;
	tn_EntropyEvent.hasMouse = true;
	HintText.setEntropyText();
}
function tn_EntropyEvent::onMouseLeave(%this, %mod, %pos, %count)
{
	if (tn_EntropyEvent.finished)
		return;
	tn_EntropyEvent.hasMouse = false;
	HintText.setEntropyText();
}
function logEntropy()
{
	if (tn_EntropyEvent.finished)
		return;
    
	// Ruby Invocation Happens Here...
	// first call of this function... build the Mersenne Twister RNG in Ruby
	if (!$rubyRNGCreated)
	{
		$rubyRNGCreated = 1;
		rubyEval("$twister = MersenneTwister.new");
		rubyEval("$entropy = 0");
	}

	if ( CreateAccountDlg.page != 2 || !CreateAccountDlg.open )
		return;
	if ( tn_EntropyEvent.lastPos $= canvas.getCursorPos() )
	{
		schedule(128, 0, logEntropy);
		return;
	}
	if ( tn_EntropyEvent.hasMouse )
	{
		tn_EntropyEvent.lastPos = canvas.getCursorPos();
		tn_EntropyEvent.time--;
		if (strstr( tn_EntropyEvent.time, 0) != -1)
		{
			%pos = canvas.getCursorPos();
			%bit = new GuiBitmapCtrl() {
				profile = "noMoreModal";
				bitmap = "texticons/bullet_2";
				extent = "19 18";
				visible = true;
				opacity = "0.25";
				minExtent = "19 18";
				helpTag = "0";
				wrap = true;
			};
			tn_EntropyBox.add(%bit);
			%bit.setPosition(getWord(%pos,0)-365,getWord(%pos,1)-320);
		}
		%entropy = strreplace(canvas.getCursorPos()," ","");
		// Ruby Invocation Happens Here...
		// add the current screen coordinate to the entropy pool
		rubyEval("$entropy = $entropy + " @ %entropy);
		if ( tn_EntropyEvent.time == 0 )
		{
			rubyEval("$entropy = $entropy + " @ getRealTime());
			//rubyEval("puts $entropy % 4294967296");
			rubyEval("$twister.seedgen($entropy % 4294967296)");
			tn_EntropyEvent.finished = true;
			beginEntropyWait();
		}
		else
			schedule(128,0, logEntropy);
		HintText.setEntropyText();
	}
	else
		schedule(128,0, logEntropy);
}

// churn the RNG state for additional entropy
function beginEntropyWait()
{
	if (CreateAccountDlg.page != 2 || $keyCreated)
		return;
	if (isEventPending($entropyWait))
	{
		cancel($entropyWait);
	}
	$entropyWait = schedule(256, 0, beginEntropyWait);

	rubyEval("$twister.randomnumber(160)");
}

// Warrior name check.  Useful to keep entry valid.
function CA_userName::validateWarriorName( %this )
{
	%name = %this.getValue();
	%test = strToPlayerName( %name );
	if ( %name !$= %test )
		%this.setText( %test );
}

// If the options aren't in, disable the button.
function updateNextButton()
{
	if ( !CreateAccountDlg.open )
		return;

	%done = true;
	switch (CreateAccountDlg.page)
	{
	  case 1:
		if (!$RubyEnabled)
		{
			HintText.setText("Your game is not running the patched executable.");
			HintText2.setText("Close the game and verify it is patched.");
			%done = false;
		}
		else if ($AuthServer::Address $= "")
		{
			HintText.setText("The server address has not yet been retrieved.");
			HintText2.setText("Close this page and try again in a moment.");
			authConnect_findAuthServer();
			%done = false;
		}
		else if (!CreateAccountDlg.online)
		{
			if (CreateAccountDlg.online !$= "")
			{
				HintText.setText("The account server is <color:FF0000>OFFLINE<color:42e5f4> or unreachable.");
				HintText2.setText("Check your network connection and try again.");
			}
			%done = false;
		}
		else
		{
			HintText.setText("The account server is <color:00FF00>ONLINE<color:42e5f4> and connectable.");
			HintText2.setText("Click the NEXT STEP button to proceed.");
		}
		
	  case 2:
		if (!$keyCreated) %done = false;
		
	  case 3:
		if (strlen($CreateAccountLoginName) < 4)
		{
			%done = false;
			if (strlen($CreateAccountLoginName) > 0)
				HintText.setText("<color:FF0000>Error:<color:42e5f4> Your username must be at least 4 characters long.");
			else
				HintText.setText("");
		}
		else if (strlen($CreateAccountPassword) < 6)
		{
			%done = false;
			if (strlen($CreateAccountPassword) > 0)
				HintText.setText("<color:FF0000>Error:<color:42e5f4> Your password must be at least 6 characters long.");
			else
				HintText.setText("");
		}
		else if (strcmp($CreateAccountPassword, $CreateAccountConfirmPassword))
		{
			%done = false;
			if (strlen($CreateAccountConfirmPassword) > 0)
				HintText.setText("<color:FF0000>Error:<color:42e5f4> Your password confirmation doesn't match.");
			else
				HintText.setText("");
		}
		else
		{
			if ($CreateAccountLastEnteredUsername !$= $CreateAccountLoginName)
			{
				// client has typed in a new name... test suitability with the auth server
				$CreateAccountLastEnteredUsername = $CreateAccountLoginName;
				$Authentication::Status::Name = "";
				$NameSuitabilityMode = 1;
				Authentication_checkName($CreateAccountLoginName);
				t2csri_testNameSuitability();
			}
			if ($NameSuitabilityMode)
			{
				HintText.setText("");
				%done = false;
			}
			if ($Authentication::Status::Name !$= "Name is available and acceptable.")
			{
				%status = ($Authentication::Status::Name $= "") ? "Checking name for availability..." : "<color:FF0000>Error:<color:42e5f4>" SPC $Authentication::Status::Name;
				HintText.setText(%status);
				%done = false;
			}
		}

	}
	CreateAccountNextBtn.setActive( %done );

	schedule( 1000, 0, updateNextButton );
}

function t2csri_testNameSuitability()
{
	// if no transaction to the authentication server is active...
	if ($Authentication::Status::ActiveMode == 0)
	{
		if ($Authentication::Status::Name !$= "Name is available and acceptable.")
			%status = "<color:FF0000>Error:<color:42e5f4> ";
		else
			%status = "<color:00FF00>Success:<color:42e5f4> ";
		HintText.setText(%status @ $Authentication::Status::Name);
		$NameSuitabilityMode = 0;
	}
	else
	{
		// otherwise, check again, as the transaction may still be in progress
		schedule(128, 0, t2csri_testNameSuitability);
	}
}

function CreateAccountDlg::genBtn(%this)
{
	LoginMessagePopup( "Creating your key...", "<color:42e5f4>This can take a few minutes.\n<font:Univers Condensed Bold:22><color:ff2222>DO NOT EXIT THE GAME\n" );
	schedule( 2000, 0, popLoginMessage );
	// Ruby Invocation Happens Here...
	// Pass this through to the key generation function.
	// $keyStrength
	$keyStrength = getSubStr($keyStrength, 4, strlen($keyStrength));
	rubyEval("$accountKey = RSAKey.new");
	rubyEval("$accountKey.twister = $twister");
	cancel($entropyWait);
	schedule(1024, 0, rubyEval, "$accountKey.generate(" @ $keyStrength @ ")");

	// When done, have the following set:
	$keyCreated = true;
	CA_strength.setActive(!$keyCreated);
	CreateAccountGenBtn.setActive(!$keyCreated);
	CreateAccountGenBtn.setValue("KEY GENERATED");
	HintText2.setText("Click the NEXT STEP button to proceed.");
	CreateAccountNextBtn.setActive(1);
}
function popLoginMessage()
{
	Canvas.popDialog( LoginMessagePopupDlg );
}
function newCreateAccount()
{
	$CreateAccountLoginName = "";
	$CreateAccountPassword = "";
	$CreateAccountConfirmPassword = "";
	Canvas.pushDialog( CreateAccountDlg );
	Canvas.popDialog( LoginDlg );
	CreateAccountDlg.page = 0;
	CreateAccountDlg.nextBtn();
}
function newLoginProcess()
{
	if (!$RubyEnabled)
	{
		MessageBoxOK("LOGIN ERROR","<color:42e5f4>Your game is not running the patched game executable.\n\nClose the game and verify the patch was run successfully.");
		return;
	}
	if (LoginEditMenu.getSelected() == 0)
	{
		if ( strlen( $LoginName ) < 3 )
			return;
		else
		{
			if ( LoginEditMenu.findText( $LoginName ) == -1 )
				MessageBoxYesNo("Connect Account","<color:42e5f4>That account isn't stored locally, would you like to retrieve it from the account server?","t2csri_downloadAccount($LoginName, $LoginPassword);","");
			else
			{
				LoginMessagePopup( "PLEASE WAIT", "Logging in..." );
				schedule(128, 0, t2csri_doLogin, $LoginName, $LoginPassword);
			}
		}
	}
	else
	{
		if ( $pref::RememberPassword )
			LoginPasswordBox.savePassword();
		LoginMessagePopup( "PLEASE WAIT", "Logging in..." );
		schedule(128, 0, t2csri_doLogin, $LastLoginKey, $LoginPassword);
	}
}


function t2csri_doLogin(%username, %password)
{
	//warn(%username SPC %password);
	%status = t2csri_getAccount(%username, %password);
	warn(%status);
	if (%status $= "SUCCESS")
	{
		// continue login
		$pref::LastLoginKey = $LastLoginKey;
		export( "$pref::*", "prefs/ClientPrefs.cs", false);
		Canvas.popDialog(LoginDlg);
		schedule(128, 0, popLoginMessage);
		schedule(128, 0, LoginDone);

		// set the active "alias" to the current username
		for (%i = 0; %i < $pref::Player::Count; %i++)
		{
			if (getField($pref::Player[%i], 0) $= trim(%username))
				$pref::Player::Current = %i;
		}
	}
	else if (%status $= "INVALID_PASSWORD")
	{
		// pop-up a dialog asking the player to try again
		popLoginMessage();
		LoginMessagePopup( "INVALID PASSWORD", "The password you entered is not correct. Try again." );
		schedule(3000, 0, popLoginMessage);
	}
	else
	{
		popLoginMessage();
		LoginMessagePopup( "ERROR", "An unknown error occured. Status code: " @ %status);
		schedule(3000, 0, popLoginMessage);
	}
}
