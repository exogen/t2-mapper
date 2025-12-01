// Tribes 2 Unofficial Authentication System
// https://www.tribesnext.com/
// Written by Krash & Electricutioner/Thyth
// Copyright 2008-2009 by Electricutioner/Thyth, and the Tribes 2 Community System Reengineering Intitiative

// Login UIs and Account processing jumble.

$PlayingOnline = true;
$LastLoginKey = $pref::LastLoginKey;

if ($pref::Engine::FramerateLimit $= "")
   setFramerateLimit(500);

exec("scripts/commonDialogs.cs");
exec("gui/MessageBoxDlg.gui");

exec("scripts/heavy_male.cs");

exec("t2csri/loginDialogs.gui");
exec("t2csri/glue.cs");

// Add these to the StartupGui to make sure everything gets cleaned up.
StartupGui.add(TN_logo);
StartupGui.add(ShellTextCenterProfile);
StartupGui.add(ShellTextLeftProfile);
StartupGui.add(noMoreModal);

function checkLogoPosition()
{
   %extent = StartupGui.getExtent();
   %width = getWord(%extent, 0);
   %height = getWord(%extent, 1);
   %center_line = %height / 2;

   %pane_pos = LoginPane.getPosition();
   %pane_x = getWord(%pane_pos, 0);
   %pane_y = getWord(%pane_pos, 1);

   if (%pane_y < %center_line + 100)
   {
      %pane_y = mMin(%center_line + 100, %height - (getWord(LoginPane.getExtent(), 1) + 20));
      LoginPane.vertSizing = "bottom";
      LoginPane.setPosition(%pane_x, %pane_y);

      %logo_width = getWord(TN_logo.getExtent(), 0);
      %x = (%width - %logo_width) / 2;
      %y = (%center_line - 200);
      TN_logo.vertSizing = "top";
      TN_logo.setPosition(%x, %y);
   }
}

function LoginDlg::onWake(%this)
{
   checkLogoPosition();

   // LoginInstructions.setText(
   // "Use the form below to log in with an existing saved TribesNEXT account, retrieve an account key, or register"
   // @ " a new account for online play.");
}

function LoginEditMenu::populate(%this)
{
   %this.add( "Retrieve Account", 0 );

   // LoginEditMenu.add( %name, %id );
   // Make sure to index keys to the number in the menu.  0 is used for key download.
   // Use LoginEditMenu.size() for current length.
   //
   // When a new key is downloaded through t2csri_downloadAccount, try to have it use
   // the setSelected/onSelect functions after adding to make the new field current and default

   $accountList = t2csri_listAccounts();

   %count = 0;
   %accounts = getFieldCount($accountList);
   for (%i = 0; %i < %accounts; %i++)
   {
      %this.add(getField($accountList, %i), %count++);
   }
 
   if (%count < 1)
      %this.setActive(0);

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
function LoginEditMenu::onSelect( %this, %id, %text )
{
   if (%id == 0)
   {
      LoginPasswordBox.setPosition(118, 99);
      passTxt.setPosition(37, 107);
      accnTxt.setPosition(37, 77);
      rmbrPass.setVisible(0);
      LoginEditBox.setVisible(1);
   }
   else
   {
      LoginPasswordBox.setPosition(118, 69);
      passTxt.setPosition(37, 77);
      accnTxt.setPosition(37, 47);
      rmbrPass.setVisible(1);
      LoginEditBox.setVisible(0);
   }

   $LastLoginKey = %text;
   %this.setText(%text);
}

LoginEditMenu.populate();

// Track the open state, and disable the next button unless ready to go.
function CreateAccountDlg::onWake(%this)
{
   %this.open = true;

   if (!%this.eulaLoaded)
   {
      %file = new FileObject();

      if (%file.openForRead("t2csri_eula.txt"))
      {
         AccountAgreementText.addText("<tab:5 10 15>" @ %file.readLine(), 0);
         while (!%file.isEOF())
         {
            %line = %file.readLine();
            AccountAgreementText.addText("\n" @ %line, 0);
         }

         AccountAgreementText.addText("", 1);
         %this.eulaLoaded = true;
         %file.close();
      }

      %file.delete();
   }

   if (!%this.eulaLoaded)
   {
      Canvas.popDialog(CreateAccountDlg);
      MessageBoxOK("ERROR", "An error occurred loading the EULA text. Please try again.", "Canvas.pushDialog(LoginDlg);");
   }
   else
   {
      // Check online status.
      Authentication_checkAvail();
      // If it's online, set %this.online to true.
      t2csri_checkOnlineStatusLoop(%this);
   }
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

function CA_PlayerModel::onMouseDown(%this)
{
   CA_PlayerModel.setSequence("cel2");
}

// All the account creation page junk is sent through here.
function CreateAccountDlg::nextBtn(%this,%reverse)
{
   CreateAccountNextBtn.setActive(false);

   %this.showFields[1] = false;
   %this.showFields[2] = false;
   %this.showFields[3] = false;

   if (%reverse) %this.page--;
   else %this.page++;

   %this.showFields[%this.page] = true;
   switch (%this.page)
   {
      case 1:
         t2csri_clearAccount();

         CreateAccountPrevBtn.text = "CANCEL";
         CreateAccountNextBtn.text = "ACCEPT";

         %headtext = "License Agreement";
         AccountInstructions.setText(%headtext);
         AccountText.setText("");

         HintText.setVisible(1);
         HintText.setPosition(30, 290);
         HintText.setText("");

         %hintText = "Please wait while the server status is checked.";
         HintText2.setText(%hintText);
         // LoginMessagePopup("PLEASE WAIT", "<color:42e5f4>Your account key is being generated. This may take a moment.\n\n" );

         $keyStrength = 1024;
         $keyCreated = t2csri_generateKeypair($keyStrength);
         // Canvas.popDialog(LoginMessagePopupDlg);
         if (!$keyCreated)
         {
            Canvas.popDialog(CreateAccountDlg);
            MessageBoxOK("ERROR", "An error occurred generating your credentials.\n\nPlease try again.", "Canvas.pushDialog(CreateAccountDlg);");
         }


      case 2:
         %headtext = "Choose Your Account Details";
         %body = "Select your account details and confirm they're correct before registering your account.\n\n" @ 
         "Don't lose your password: you will lose access to your account.";

         AccountInstructions.setText(%headtext);
         AccountText.setText(%body);

         CreateAccountPrevBtn.text = "BACK";
         CreateAccountNextBtn.text = "CREATE ACCOUNT";

         HintText.setVisible(1);
         HintText.setPosition(30, 290);
         HintText.setText("");

         HintText2.setText("Fill out the above form to proceed.");

         CA_PlayerModel.setModel("heavy_male", "beagle");
         CA_PlayerModel.setSequence("root");
         // CA_PlayerModel.setSequence("cel5");//cel2 wwave

      case 3:
         LoginMessagePopup("PLEASE WAIT", "Registering Account with the Authentication Server...");
         t2csri_requestAccountSignature(%this);

      default:
         Canvas.popDialog(CreateAccountDlg);
         Canvas.pushDialog(LoginDlg);
   }

   AccountAgreement.setVisible(%this.showFields[1]);

   CN_userName.setVisible(%this.showFields[2]);
   CA_userName.setVisible(%this.showFields[2]);
   CN_chooPass.setVisible(%this.showFields[2]);
   CA_chooPass.setVisible(%this.showFields[2]);
   CN_confPass.setVisible(%this.showFields[2]);
   CA_confPass.setVisible(%this.showFields[2]);
   CA_PlayerModel.setVisible(%this.showFields[2]);
}

// ready to send the account to the server for processing, prepare it...
function t2csri_requestAccountSignature(%this)
{
   %certificate = $CreateAccountLoginName TAB t2csri_getAccountCertificate();
   $encryptedExponent = t2csri_encryptAccountKey($CreateAccountPassword);
   if ($encryptedExponent $= "-1")
   {
      // set an error message
      LoginMessagePopup("ERROR", "An error occurred encrypting your account credentials. Please try again.");
      return;
   }

   %authSHA = sha1sum("3.14159265" @ trim(strlwr($CreateAccountLoginName)) @ $CreateAccountPassword);
   %reqSig = %certificate TAB $encryptedExponent TAB %authSHA;

   // (RC2) perform a signature operation on the fields from the name to the end
   %requestSHA1 = sha1sum(%reqSig);
   %requestRSA = t2csri_rsa_decrypt(%requestSHA1);
   %reqSig = %reqSig TAB %requestRSA;

   // echo("Request: " @ %reqSig);

   $Authentication::Status::LastCert = "";
   Authentication_registerAccount(%reqSig);
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
         t2csri_clearAccount();

         // store the account data to file
         %username = getField($Authentication::Status::LastCert, 0);
         if (!t2csri_storeAccount($Authentication::Status::LastCert, %username TAB $encryptedExponent))
         {
            // we hit an error writing to disk
         }

         $encryptedExponent = "";
         %status = t2csri_loginAccount(%username, $CreateAccountPassword);
         $CreateAccountPassword = "";
         $CreateAccountConfirmPassword = "";

         if (%status $= "SUCCESS")
         {
            $LoginCertificate = $Authentication::Status::LastCert;
            $pref::LastLoginKey = %username;

            // success
            LoginMessagePopup("SUCCESS", "Account generated successfully. Storing account data to disk and logging in...");

            schedule(2000, 0, popLoginMessage);
            schedule(2000, 0, LoginDone);
         }
         else
         {
            Canvas.popDialog(CreateAccountDlg);
            MessageBoxOK("ERROR", "Your account was created, but an unknown error occurred saving your account details locally.\n\nPlease try retrieving your account.", "Canvas.pushDialog(LoginDlg);");
         }
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
         schedule(5000, 0, popLoginMessage);
      }
   }
   else
   {
      // otherwise, check again, as the transaction may still be in progress
      schedule(128, 0, t2csri_completeAccountRequest, %this);
   }
}

// Warrior name check.  Useful to keep entry valid.
function CA_userName::validateWarriorName( %this )
{
   %name = %this.getValue();
   %test = strToPlayerName(%name);

   if ( %name !$= %test )
      %this.setText(%test);
}

// If the options aren't in, disable the button.
function updateNextButton()
{
   if (!CreateAccountDlg.open)
      return;

   %done = true;
   switch (CreateAccountDlg.page)
   {
     case 1:
      if (!$T2CSRI::AccountState)
      {
         HintText.setText("<just:center>Your game is not running the patched executable.");
         HintText2.setText("Close the game and verify it is patched.");

         %done = false;
      }
      else if ($AuthServer::Address $= "")
      {
         HintText.setText("<just:center>The server address has not yet been retrieved.");
         HintText2.setText("Close this page and try again in a moment.");

         authConnect_findAuthServer();

         %done = false;
      }
      else if (!CreateAccountDlg.online)
      {
         if (CreateAccountDlg.online !$= "")
         {
            HintText.setText("<just:center>The account server is <color:FF0000>OFFLINE<color:42e5f4> or unreachable.");
            HintText2.setText("Check your network connection and try again.");
         }

         %done = false;
      }
      else
      {
         HintText.setText("<just:center>The account server is <color:00FF00>ONLINE<color:42e5f4> and connectable.");
         HintText2.setText("Click the ACCEPT button to proceed.");
      }

     case 2:
      if (!$keyCreated)
      {
         %done = false;
      }
      else if (strlen($CreateAccountLoginName) < 4)
      {
         %done = false;

         if (strlen($CreateAccountLoginName) > 0)
            HintText.setText("<just:center><color:FF0000>Error:<color:42e5f4> Your username must be at least 4 characters long.");
         else
            HintText.setText("");
      }
      else if (strlen($CreateAccountPassword) < 6)
      {
         %done = false;

         if (strlen($CreateAccountPassword) > 0)
            HintText.setText("<just:center><color:FF0000>Error:<color:42e5f4> Your password must be at least 6 characters long.");
         else
            HintText.setText("");
      }
      else if (strcmp($CreateAccountPassword, $CreateAccountConfirmPassword))
      {
         %done = false;

         if (strlen($CreateAccountConfirmPassword) > 0)
            HintText.setText("<just:center><color:FF0000>Error:<color:42e5f4> Your password confirmation doesn't match.");
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
            HintText.setText("<just:center>" @ %status);

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
      {
         %status = "<color:FF0000>Error:<color:42e5f4> ";
         HintText2.setVisible(1);
      }
      else
      {
         %status = "<color:00FF00>Success:<color:42e5f4> ";
         HintText2.setVisible(0);
      }

      HintText.setText("<just:center>" @ %status @ $Authentication::Status::Name);
      $NameSuitabilityMode = 0;
   }
   else
   {
      // otherwise, check again, as the transaction may still be in progress
      schedule(128, 0, t2csri_testNameSuitability);
   }
}

function popLoginMessage()
{
   Canvas.popDialog(LoginMessagePopupDlg);
}

function newCreateAccount()
{
   $CreateAccountLoginName = "";
   $CreateAccountPassword = "";
   $CreateAccountConfirmPassword = "";

   Canvas.pushDialog(CreateAccountDlg);
   Canvas.popDialog(LoginDlg);

   CreateAccountDlg.page = 0;
   CreateAccountDlg.nextBtn();
}

function newLoginProcess()
{
   if (!$T2CSRI::AccountState)
   {
      MessageBoxOK("LOGIN ERROR","<color:42e5f4>Your game is not running the patched game executable.\n\nClose the game and verify the patch was run successfully.");
      return;
   }

   if (LoginEditMenu.getSelected() == 0)
   {
      if ( strlen( $LoginName ) < 3 )
      {
         return;
      }
      else
      {
         if ( LoginEditMenu.findText( $LoginName ) == -1 )
         {
            MessageBoxYesNo("Connect Account","<color:42e5f4>That account isn't stored locally, would you like to retrieve it from the account server?","t2csri_downloadAccount($LoginName, $LoginPassword);","");
         }
         else
         {
            LoginMessagePopup("PLEASE WAIT", "Logging in...");
            schedule(128, 0, t2csri_doLogin, $LoginName, $LoginPassword);
         }
      }
   }
   else
   {
      if ($pref::RememberPassword)
         LoginPasswordBox.savePassword();

      LoginMessagePopup("PLEASE WAIT", "Logging in...");
      schedule(128, 0, t2csri_doLogin, $LastLoginKey, $LoginPassword);
   }
}

function t2csri_doLogin(%username, %password)
{
   %status = t2csri_loginAccount(%username, %password);
   // warn(%status);

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
      schedule(2000, 0, popLoginMessage);
   }
   else
   {
      popLoginMessage();
      LoginMessagePopup( "ERROR", "An unknown error occured. Status code: " @ %status);
      schedule(2000, 0, popLoginMessage);
   }
}
