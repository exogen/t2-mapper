//--------------------------------------------------------
function QueryServers( %searchCriteria )
{
   GMJ_Browser.lastQuery = %searchCriteria;
   LaunchGame( "JOIN" );
}

//--------------------------------------------------------
function QueryOnlineServers()
{
   QueryServers("Master");
}

//--------------------------------------------------------
// Launch gui functions
//--------------------------------------------------------
function PlayOffline()
{
   $FirstLaunch = true;
   setNetPort(0);
   $PlayingOnline = false;
   Canvas.setContent(LaunchGui);
}

//--------------------------------------------------------
function OnlineLogIn()
{
   $FirstLaunch = true;
   setNetPort(0);
   $PlayingOnline = true;
   FilterEditGameType.clear();
   FilterEditMissionType.clear();
   queryMasterGameTypes();
   // Start the Email checking...
   EmailGui.checkSchedule = schedule( 5000, 0, CheckEmail, true );
   
   // Load the player database...
   %guid = getField( WONGetAuthInfo(), 3 );
   if ( %guid > 0 )
      loadPlayerDatabase( "prefs/pyrdb" @ %guid );
   Canvas.setContent(LaunchGui);
}

//--------------------------------------------------------
function LaunchToolbarMenu::onSelect(%this, %id, %text)
{
   switch(%id)
   {
      case 0:
         LaunchGame();
      case 1: // Start Training Mission
         LaunchTraining();
      case 2:
         LaunchNews();
      case 3:
         LaunchForums();
      case 4:
         LaunchEmail();
      case 5: // Join Chat Room
         Canvas.pushDialog(JoinChatDlg);
      case 6:
         LaunchBrowser();
		case 7: // Options
			Canvas.pushDialog(OptionsDlg);
      case 8: // Play Recording
         Canvas.pushDialog(RecordingsDlg);
      case 9: // Quit
         if(isObject($IRCClient.tcp))
            IRCClient::quit();
         LaunchTabView.closeAllTabs();
         if (!isDemo())
            quit();
         else
            Canvas.setContent(DemoEndGui);
      //case 10: // Log Off
      //   LaunchTabView.closeAllTabs();
      //   PlayOffline();
      //case 11: // Log On
      //   LaunchTabView.closeAllTabs();
      //   OnlineLogIn();
      case 12:
         LaunchCredits();
   }
}

//--------------------------------------------------------
function LaunchToolbarDlg::onWake(%this)
{
   // Play the shell hum:
   if ( $HudHandle[shellScreen] $= "" )
      $HudHandle[shellScreen] = alxPlay( ShellScreenHumSound, 0, 0, 0 );

   LaunchToolbarMenu.clear();

   if ( isDemo() )
   {
      LaunchToolbarMenu.add( 1, "TRAINING" );
      LaunchToolbarMenu.add( 0, "GAME" );
      LaunchToolbarMenu.add( 2, "NEWS" );
   }
   else if ( $PlayingOnline )
   {
      LaunchToolbarMenu.add( 0, "GAME" );
      LaunchToolbarMenu.add( 4, "EMAIL" );
      LaunchToolbarMenu.add( 5, "CHAT" );
      LaunchToolbarMenu.add( 6, "BROWSER" );
   }
   else
   {
      LaunchToolbarMenu.add( 1, "TRAINING" );
      LaunchToolbarMenu.add( 0, "LAN GAME" );
   }

   LaunchToolbarMenu.addSeparator();
   LaunchToolbarMenu.add( 7, "SETTINGS" );
   if ( !isDemo() )
      LaunchToolbarMenu.add( 8, "RECORDINGS" );
   LaunchToolbarMenu.add( 12, "CREDITS" );

   LaunchToolbarMenu.addSeparator();
   LaunchToolbarMenu.add( 9, "QUIT" );

   %on = false;
   for ( %tab = 0; %tab < LaunchTabView.tabCount(); %tab++ )
   {
      if ( LaunchTabView.isTabActive( %tab ) )
      {
         %on = true;
         break;
      }
   }
   
   LaunchToolbarCloseButton.setVisible( %on );
}

//----------------------------------------------------------------------------
// Launch Tab Group functions:
//----------------------------------------------------------------------------
function OpenLaunchTabs( %gotoWarriorSetup )
{
   if ( LaunchTabView.tabCount() > 0 || !$FirstLaunch )
      return;

   $FirstLaunch = "";

   // Set up all of the launch bar tabs:
   if ( isDemo() )
   {
      LaunchTabView.addLaunchTab( "TRAINING",   TrainingGui );
      LaunchTabView.addLaunchTab( "GAME",       GameGui );
      LaunchTabView.addLaunchTab( "NEWS",       NewsGui );
      LaunchTabView.addLaunchTab( "FORUMS",     "", true );
      LaunchTabView.addLaunchTab( "EMAIL",      "", true );
      LaunchTabView.addLaunchTab( "CHAT",       "", true );
      LaunchTabView.addLaunchTab( "BROWSER",    "", true );
      %launchGui = NewsGui;
   }
   else if ( $PlayingOnline )
   {
      LaunchTabView.addLaunchTab( "GAME",    GameGui );
      LaunchTabView.addLaunchTab( "EMAIL",   EmailGui );
      LaunchTabView.addLaunchTab( "CHAT",    ChatGui );
      LaunchTabView.addLaunchTab( "BROWSER", TribeandWarriorBrowserGui);

      switch$ ( $pref::Shell::LaunchGui )
      {
         case "News":      %launchGui = NewsGui;
         case "Forums":    %launchGui = ForumsGui;
         case "Email":     %launchGui = EmailGui;
         case "Chat":      %launchGui = ChatGui;
         case "Browser":   %launchGui = TribeandWarriorBrowserGui;
         default:          %launchGui = GameGui;
      }
   }
   else
   {
      LaunchTabView.addLaunchTab( "TRAINING",   TrainingGui );
      LaunchTabView.addLaunchTab( "LAN GAME",   GameGui );
      %launchGui = TrainingGui;
   }

   if ( %gotoWarriorSetup )
      LaunchGame( "WARRIOR" );
   else
      LaunchTabView.viewTab( "", %launchGui, 0 );
   
   if ( $IssueVoodooWarning && !$pref::SawVoodooWarning )
   {
      $pref::SawVoodooWarning = 1;
      schedule( 0, 0, MessageBoxOK, "WARNING", "A Voodoo card has been detected.  If you experience any graphical oddities, you should try the WickedGl drivers available at www.wicked3d.com" );
   }
}

//--------------------------------------------------------
function LaunchTabView::addLaunchTab( %this, %text, %gui, %makeInactive )
{
   %tabCount = %this.tabCount();
   %this.gui[%tabCount] = %gui;
   %this.key[%tabCount] = 0;
   %this.addTab( %tabCount, %text );
	if ( %makeInactive )
		%this.setTabActive( %tabCount, false );
}

//--------------------------------------------------------
function LaunchTabView::onSelect( %this, %id, %text )
{
   // Ignore the ID - it can't be trusted.
   %tab = %this.getSelectedTab();

   if ( isObject( %this.gui[%tab] ) )
   {
      Canvas.setContent( %this.gui[%tab] );
      %this.gui[%tab].setKey( %this.key[%tab] );
      %this.lastTab = %tab;
   }
}

//--------------------------------------------------------
function LaunchTabView::viewLastTab( %this )
{
   if ( %this.tabCount() == 0 || %this.lastTab $= "" )
      return;

   %this.setSelectedByIndex( %this.lastTab );
}

//--------------------------------------------------------
function LaunchTabView::viewTab( %this, %text, %gui, %key )
{
   %tabCount = %this.tabCount();
   for ( %tab = 0; %tab < %tabCount; %tab++ )
      if ( %this.gui[%tab] $= %gui && %this.key[%tab] $= %key )
         break;

   if ( %tab == %tabCount )
   {
      // Add a new tab:
      %this.gui[%tab] = %gui;
      %this.key[%tab] = %key;
      // WARNING! This id may not be unique and therefore should
      // not be relied on!  Use index instead!
      %this.addTab( %tab, %text );
   }

   if ( %this.getSelectedTab() != %tab )
      %this.setSelectedByIndex( %tab );
}

//--------------------------------------------------------
function LaunchTabView::closeCurrentTab( %this )
{
   %tab = %this.getSelectedTab();
   %this.closeTab( %this.gui[%tab], %this.key[%tab] );
}

//--------------------------------------------------------
function LaunchTabView::closeTab( %this, %gui, %key )
{
   %tabCount = %this.tabCount();
   %activeCount = 0;
   for ( %i = 0; %i < %tabCount; %i++ )
   {
      if ( %this.gui[%i] $= %gui && %this.key[%i] $= %key )
         %tab = %i;
      else if ( %this.isTabActive( %i ) )
         %activeCount++;
   }

   if ( %tab == %tabCount )
      return;
   
   for( %i = %tab; %i < %tabCount; %i++ )
   {
      %this.gui[%i] = %this.gui[%i+1];
      %this.key[%i] = %this.key[%i+1];
   }

   %this.removeTabByIndex( %tab );
   %gui.onClose( %key );
   
   if ( %activeCount == 0 )
   {
      %this.lastTab = "";
      Canvas.setContent( LaunchGui );
   }
}

//--------------------------------------------------------
function LaunchTabView::closeAllTabs( %this )
{
   %tabCount = %this.tabCount();
   for ( %i = 0; %i < %tabCount; %i++ )
   {
      if ( isObject( %this.gui[%i] ) )
         %this.gui[%i].onClose( %this.key[%i] );
      %this.gui[%i] = "";
      %this.key[%i] = "";
   }

   %this.clear();
}

//----------------------------------------------------------------------------
// LaunchGui functions:
//----------------------------------------------------------------------------
function LaunchGui::onAdd(%this)
{
   %this.getWarrior = true;
}

//----------------------------------------------------------------------------
function LaunchGui::onWake(%this)
{
   $enableDirectInput = "0";
   deactivateDirectInput();
   Canvas.pushDialog(LaunchToolbarDlg);
   if ( !$FirstLaunch )
      LaunchTabView.viewLastTab();

	if ( !isDemo() )
   	checkNamesAndAliases();
	else
		OpenLaunchTabs();
}

//----------------------------------------------------------------------------
function LaunchGui::onSleep(%this)
{
   //alxStop($HudHandle['shellScreen']);
   Canvas.popDialog( LaunchToolbarDlg );
}

//----------------------------------------------------------------------------
function checkNamesAndAliases()
{
   %gotoWarriorSetup = false;
   if ( $PlayingOnline )
   {
      // When first launching, make sure we have a valid warrior:
      if ( LaunchGui.getWarrior )
      {
         %cert = WONGetAuthInfo();
         if ( %cert !$= "" )
         {
            LaunchGui.getWarrior = "";
            if ( %cert $= "" )
               %warrior = $CreateAccountWarriorName;
            else
               %warrior = getField( %cert, 0 );

            %warriorIdx = -1;
            for ( %i = 0; %i < $pref::Player::count; %i++ )
            {
               if ( %warrior $= getField( $pref::Player[%i], 0 ) )
               {
                  %warriorIdx = %i;
                  break;
               }
            }

            if ( %warriorIdx == -1 )
            {
               // Create new warrior:
               $pref::Player[$pref::Player::Count] = %warrior @ "\tHuman Male\tbeagle\tMale1";
               $pref::Player::Current = $pref::Player::Count;
               $pref::Player::Count++;
               %gotoWarriorSetup = true;
            }
         }
         else
            MessageBoxOK( "WARNING", "Failed to get account information.  You may need to quit the game and log in again." );
      }
   }
   else if ( $pref::Player::Count == 0 )
   {
      %gotoWarriorSetup = true;
   }

   OpenLaunchTabs( %gotoWarriorSetup );
}
