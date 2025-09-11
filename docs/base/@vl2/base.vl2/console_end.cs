if ( $pref::Shell::lastBackground > 4 )
	$pref::Shell::lastBackground = 0;
else
	$pref::Shell::lastBackground++;

// load default controls:
exec("scripts/controlDefaults.cs");

// override with control settings
if ( $pref::Input::ActiveConfig !$= "" )
   exec( "prefs/" @ $pref::Input::ActiveConfig @ ".cs", false, true );

// ---------------------------------------------------------------------------------
// z0dd - ZOD, 5/8/02. Moved here so scripters can use the message callback feature.
// message.cs is loaded so autoexec can add new message callbacks
exec("scripts/message.cs");

//exec any user created .cs files found in scripts/autoexec (order is that returned by the OS)
function loadCustomScripts()
{     
   %path = "scripts/autoexec/*.cs";
   for( %file = findFirstFile( %path ); %file !$= ""; %file = findNextFile( %path ) )
       exec( %file );    
}
loadCustomScripts();

// override settings from autoexec.cs
exec("autoexec.cs");
$LoginName = "";
 $LoginPassword = "";

//TINMAN hack to add a command line option for starting a bot match...
if ($CmdLineBotCount !$= "")
{
	$Host::BotCount = $CmdLineBotCount;
}

// message.cs is loaded so autoexec can add new message callbacks
// z0dd - ZOD, 5/8/02. Moved so scripters can use the message callback feature.
//exec("scripts/message.cs");

//function to be called when the game exits
function onExit()
{
   if ( !isDemo() && isObject($IRCClient.tcp) )
      IRCClient::quit();
   
   echo("exporting pref::* to ClientPrefs.cs");
   export("$pref::*", "prefs/ClientPrefs.cs", False);
   BanList::Export("prefs/banlist.cs");
   if ( $PlayingOnline )
      savePlayerDatabase();
}


//--------------------------------------------------------------------------

exec("scripts/LaunchLanGui.cs");
exec("scripts/GameGui.cs");
exec("scripts/ChooseFilterDlg.cs");
exec("scripts/TrainingGui.cs");
exec("scripts/webstuff.cs");
exec("scripts/webemail.cs");
exec("scripts/webbrowser.cs");
exec("scripts/webtest.cs");
exec("scripts/weblinks.cs");
exec("scripts/OptionsDlg.cs");
exec("scripts/EditChatMenuGui.cs");
exec("scripts/scoreList.cs");
exec("scripts/LobbyGui.cs");
exec("scripts/DebriefGui.cs");
exec("scripts/commonDialogs.cs");
exec("scripts/client.cs");
exec("scripts/server.cs");
exec("scripts/hud.cs");
exec("scripts/objectiveHud.cs");
exec("scripts/vehicles/clientVehicleHud.cs");
exec("scripts/inventoryHud.cs");
exec("scripts/chatMenuHud.cs");
exec("scripts/scoreScreen.cs");
exec("scripts/loadingGui.cs");
exec("scripts/helpGuiText.cs");
exec("scripts/voiceChat.cs");
exec("scripts/clientTasks.cs");
exec("scripts/targetManager.cs");
exec("scripts/gameCanvas.cs");
exec("scripts/centerPrint.cs");
exec("scripts/CreditsGui.cs");
if (isDemo())
   exec("scripts/DemoEndGui.cs");
exec("scripts/ChatGui.cs");

// see if the mission and type are valid
// if they are they will be assigned into $Host::Map and $Host::MissionType
if($mission !$= "" && $missionType !$= "")
   validateMissionAndType($mission, $missionType);

if($LaunchMode $= "DedicatedServer")
{
   enableWinConsole(true);
	$Host::Dedicated = true;
   $HostGameType = "Online";
   $ServerName = $Host::GameName;
   setNetPort($Host::Port);
   CreateServer($Host::Map, $Host::MissionType);
   return;
}
else if($LaunchMode $= "Console")
{
   enableWinConsole(true);
	$Host::Dedicated = true;
   return;
}
else if($LaunchMode $= "NavBuild")
{
   enableWinConsole(true);
	$Host::Dedicated = true;
   $ServerName = $Host::GameName;
   $Host::MissionType = $missionType;
   $Host::Map = $Mission;
   setNetPort($Host::Port);
   CreateServer($Mission, $missionType);
   return;
}
else if($LaunchMode $= "SpnBuild")
{
   enableWinConsole(true);
	$Host::Dedicated = true;
   $ServerName = $Host::GameName;
   $Host::MissionType = $missionType;
   $Host::Map = $Mission;
   setNetPort($Host::Port);
   CreateServer($Mission, $missionType);
   return;
}

function recordMovie(%movieName, %fps)
{
   $timeAdvance = 1000 / %fps;
   $screenGrabThread = schedule("movieGrabScreen(" @ %movieName @ ", 0);", $timeAdvance);
}

function movieGrabScreen(%movieName, %frameNumber)
{
   if(%frameNumber < 10)
      %frameNumber = "0" @ %frameNumber;
   if(%frameNumber < 100)
      %frameNumber = "0" @ %frameNumber;
   if(%frameNumber < 1000)
      %frameNumber = "0" @ %frameNumber;
   if(%frameNumber < 10000)
      %frameNumber = "0" @ %frameNumber;
   screenshot(%movieName @ %frameNumber @ ".png");
   $screenGrabThread = schedule("movieGrabScreen(" @ %movieName @ "," @ %frameNumber + 1 @ ");", $timeAdvance);
}

function stopMovie()
{
   cancel($screenGrabThread);
}

function loadGui(%gui)
{
   exec("gui/" @ %gui @ ".gui");
}

exec("scripts/clientAudio.cs");
exec("gui/guiProfiles.cs");
exec("scripts/recordings.cs");

// tool guis 
loadGui("GuiEditorGui");
loadGui("consoleDlg");
loadGui("InspectDlg");
loadGui("CommonLoadDlg");
loadGui("CommonSaveDlg");
loadGui("FrameOverlayGui");
loadGui("TribeAdminMemberDlg");
loadGui("TSShowGui");
loadGui("TSShowLoadDlg");
loadGui("TSShowMiscDlg");
loadGui("TSShowThreadControlDlg");
loadGui("TSShowEditScale");
loadGui("TSShowLightDlg");
loadGui("TSShowTransitionDlg");
loadGui("TSShowTranDurEditDlg");
loadGui("TSShowDetailControlDlg");

// debugger GUI's
function Debugger()
{
   if(!$DebuggerLoaded)
   {
      loadGui("debuggerGui");
      loadGui("DebuggerBreakConditionDlg");
      loadGui("DebuggerConnectDlg");
      loadGui("DebuggerEditWatchDlg");
      loadGui("DebuggerWatchDlg");
      loadGui("DebuggerFindDlg");
		exec("scripts/debuggerGui.cs");
      $DebuggerLoaded = true;
   }
   Canvas.setContent(DebuggerGui);
}

// test GUIs
loadGui("GuiTestGui");

// common shell dialogs:
loadGui("MessageBoxDlg");
loadGui("MessagePopupDlg");
loadGui("ShellLoadFileDlg");
loadGui("ShellSaveFileDlg");

// menus
loadGui("AddressDlg");
loadGui("GenDialog");
loadGui("LaunchGui");
loadGui("LaunchToolbarDlg");
loadGui("GameGui");
loadGui("ChooseFilterDlg");
loadGui("ServerInfoDlg");
loadGui("EnterIPDlg");
loadGui("FindServerDlg");
loadGui("AdvancedHostDlg");
loadGui("NewWarriorDlg");
loadGui("JoinChatDlg");
loadGui("ChannelKeyDlg");
loadGui("ChatOptionsDlg");
loadGui("ChannelOptionsDlg");
loadGui("ChannelBanDlg");
loadGui("FilterEditDlg");
loadGui("PasswordDlg");
loadGui("OptionsDlg");
loadGui("DriverInfoDlg");
loadGui("RemapDlg");
loadGui("MouseConfigDlg");
loadGui("JoystickConfigDlg");
loadGui("EditChatMenuGui");
loadGui("EditChatMenuDlg");
loadGui("EditChatCommandDlg");
loadGui("ChatGui");
loadGui("EmailGui");
loadGui("EmailBlockDlg");
loadGui("EmailComposeDlg");
loadGui("TribeAndWarriorBrowserGui");
loadGui("TribePropertiesDlg");
loadGui("WarriorPropertiesDlg");
loadGui("BrowserSearchDlg");
loadGui("BrowserEditInfoDlg");
loadGui("CreateTribeDlg");
loadGui("RecordingsDlg");
loadGui("DemoLoadProgressDlg");
loadGui("DemoRenameFileDlg");
loadGui("DemoPlaybackDlg");
loadGui("TrainingGui");
loadGui("SinglePlayerEscapeDlg");
loadGui("LobbyGui");
loadGui("DebriefGui");
loadGui("CreditsGui");
if (isDemo())
   loadGui("DemoEndGui");
loadGui("MoveThreadDlg");
loadGui("NewMissionGui");
loadGui("ChatDlg");
loadGui("PlayGui");
loadGui("PanoramaGui");
loadGui("LoadingGui");
loadGui("TestGui");

// HUD GUI's:
loadGui("HUDDlgs");

// TR2 Huds
exec("prefs/TR2HudPrefs.cs");
exec("scripts/TR2BonusHud.cs");
exec("scripts/TR2EventHud.cs");
exec("scripts/TR2FlagToss.cs");

// terraformer GUI's
loadGui("helpTextGui");

//

loadGui("InteriorPreviewGui");
loadGui("InteriorDebug");
exec("scripts/editor.cs");
loadGui("SceneLightingGui");
loadGui("InspectAddFieldDlg");

loadGui("PickTeamDlg");

loadGui("DetailSetDlg");

loadGui("IHVTest");

// Load material properties
echo("Load Material Properties:");
//exec("textures/badlands/badlandsPropMap.cs");
//exec("textures/desert/desertPropMap.cs");
//exec("textures/ice/icePropMap.cs");
//exec("textures/lava/lavaPropMap.cs");
//exec("textures/lush/lushPropMap.cs");
exec("scripts/badlandsPropMap.cs");
exec("scripts/desertPropMap.cs");
exec("scripts/icePropMap.cs");
exec("scripts/lavaPropMap.cs");
exec("scripts/lushPropMap.cs");

// commander map
exec("scripts/commanderProfiles.cs");
exec("scripts/commanderMap.cs");
exec("scripts/commanderMapHelpText.cs");

loadGui(CommanderMapGui);
loadGui(cmdMapHelpText);
loadGui(TaskHudDlg);


function frameCounter()
{
   return " FPS: " @ $fps::real @ 
          "  mspf: " @ 1000 / $fps::real;
}

function terrMetrics()
{
   return frameCounter() @
          "  L0: " @ $T2::levelZeroCount @ 
          "  FMC: " @ $T2::fullMipCount @ 
          "  DTC: " @ $T2::dynamicTextureCount @
          "  UNU: " @ $T2::unusedTextureCount @
          "  STC: " @ $T2::staticTextureCount @
          "  DTSU: " @ $T2::textureSpaceUsed @
          "  STSU: " @ $T2::staticTSU @
          "  FRB: " @ $T2::FogRejections;
}

function triMetrics()
{
   return frameCounter() @
          "  TC: " @ $OpenGL::triCount0 + $OpenGL::triCount1 + $OpenGL::triCount2 + $OpenGL::triCount3 @ 
          "  PC: " @ $OpenGL::primCount0 + $OpenGL::primCount1 + $OpenGL::primCount2 + $OpenGL::primCount3 @ 
          "  T_T: " @ $OpenGL::triCount1 @ 
          "  T_P: " @ $OpenGL::primCount1 @ 
          "  I_T: " @ $OpenGL::triCount2 @ 
          "  I_P: " @ $OpenGL::primCount2 @ 
          "  TS_T: " @ $OpenGL::triCount3 @ 
          "  TS_P: " @ $OpenGL::primCount3 @ 
          "  ?_T: " @ $OpenGL::triCount0 @ 
          "  ?_P: " @ $OpenGL::primCount0;
}

function interiorMetrics()
{
   return frameCounter() @
          "  NTL: " @ $Video::numTexelsLoaded @
          "  TRP: " @ $Video::texResidentPercentage @
          "  INP: " @ $Metrics::Interior::numPrimitives @
          "  INT: " @ $Matrics::Interior::numTexturesUsed @ 
          "  INO: " @ $Metrics::Interior::numInteriors;
}

function textureMetrics()
{
   return frameCounter() @
          "  NTL: " @ $Video::numTexelsLoaded @
          "  TRP: " @ $Video::texResidentPercentage @
          "  TCM: " @ $Video::textureCacheMisses;
}

function waterMetrics()
{
   return frameCounter() @
          "  Tri#: " @ $T2::waterTriCount @
          "  Pnt#: " @ $T2::waterPointCount @
          "  Hz#: " @ $T2::waterHazePointCount;
}

function timeMetrics()
{
   return frameCounter() @ " Time: " @ getSimTime() @ " Mod: " @ getSimTime() % 32;
}

function vehicleMetrics()
{
   return frameCounter() @
          "  R: " @ $Vehicle::retryCount @
          "  C: " @ $Vehicle::searchCount @
          "  P: " @ $Vehicle::polyCount @
          "  V: " @ $Vehicle::vertexCount;
}

function audioMetrics()
{
   return frameCounter() @
          " OH:  " @ $Audio::numOpenHandles @
          " OLH: " @ $Audio::numOpenLoopingHandles @
          " OVH: " @ $Audio::numOpenVoiceHandles @
          " AS:  " @ $Audio::numActiveStreams @
          " NAS: " @ $Audio::numNullActiveStreams @
          " LAS: " @ $Audio::numActiveLoopingStreams @
          " VAS: " @ $Audio::numActiveVoiceStreams @
          " LS:  " @ $Audio::numLoopingStreams @
          " ILS: " @ $Audio::numInactiveLoopingStreams @
          " CLS: " @ $Audio::numCulledLoopingStreams @
          " MEM: " @ $Audio::memUsage @
          " DYN: " @ $Audio::dynamicMemUsage @
          " / "    @ $Audio::dynamicMemSize @
          " CNT: " @ $Audio::dynamicBufferCount @
          " / "    @ $Audio::bufferCount;
}

function DebugMetrics()
{
   return frameCounter() @
          "  NTL: " @ $Video::numTexelsLoaded @
          "  TRP: " @ $Video::texResidentPercentage @
          "  NP:  " @ $Metrics::numPrimitives @
          "  NT:  " @ $Metrics::numTexturesUsed @
          "  NO:  " @ $Metrics::numObjectsRendered;
}

function showMapperMetrics( %expr )
{
   GLEnableMetrics( %expr );
   
   if( Canvas.getContent() != PlayGui.getId() )  
      metricsIMain.setVisible( %expr );
   else 
      metricsMain.setVisible( %expr );
}

function showTerr()
{
   show("terrMetrics()");
}

function showTri()
{
   GLEnableMetrics(true);
   show("triMetrics()");
}

function showTime()
{
   show("timeMetrics()");
}

function showWater()
{
   show("waterMetrics()");
}

function showTexture()
{
   show("textureMetrics()");
}

function showInterior()
{
   $fps::virtual = 0;
   $Interior::numPolys = 0;
   $Interior::numTextures = 0; 
   $Interior::numTexels = 0; 
   $Interior::numLightmaps = 0; 
   $Interior::numLumels = 0; 
   show("interiorMetrics()");
}

function showVehicle()
{
   show("vehicleMetrics()");
}   

function showAudio()
{
   show("audioMetrics()");
}

function showDebug()
{
   show("DebugMetrics()");
}


function show(%expr)
{
   if(%expr $= "")
   {
      GLEnableMetrics(false);
      Canvas.popDialog(FrameOverlayGui);
   }
   else
   {
      Canvas.pushDialog(FrameOverlayGui, 1000);
      TextOverlayControl.setValue(%expr);
   }   
}
//showInterior();

// check the launch mode:

Canvas.setCursor("DefaultCursor");

function dumpFile(%fileName)
{
   %file = new FileObject();
   if(%file.openForRead(%fileName))
   {
      while(!%file.isEOF())
         echo(%file.readLine());
   }
   %file.delete();
}

function doScreenShot(%val)
{
   $pref::interior::showdetailmaps = false;
   if(!%val)
      screenShot("screen" @ $screenshotnum++ @ ".png");   
}

// set up the movement action map
GlobalActionMap.bind(keyboard, "print", doScreenShot);
GlobalActionMap.bindCmd(keyboard, "alt enter", "", "toggleFullScreen();");

// Get the joystick binding functions:
exec( "scripts/joystickBind.cs" );

function clientCMDgetManagerID(%client)
{
   $client = %client;
}	
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=- //

function abs(%val)
{
	if (%val < 0)
		return %val * -1;
	else
		return %val;
}  

//##############################################################################
//CreateServer(testmission);
//LocalConnect(UberBob);
//##############################################################################

function ServerConnectionAccepted()
{
   if ( !isDemo() )
   {
	   %info = GMJ_Browser.getServerInfoString();
	   %desc = "joined a" SPC getField(%info,4) @ " game (" @ getField(%info,3) @ ") on the \"" @ getField(%info,0) @ "\" server.";   

	   IRCClient::onJoinGame($JoinGameAddress,%desc);

      if ( !$pref::Net::CheckEmail )
         CancelEmailCheck();

   // 	if($pref::Net::DisconnectChat)
   //    		IRCClient::quit();
   }

   checkGotLoadInfo();
}

function LocalConnectionAccepted()
{   
   if ( !isDemo() )
   {   
	   %desc = $pref::IRCClient::hostmsg;

	   IRCClient::onJoinGame("", %desc);

      if ( !$pref::Net::CheckEmail )
         CancelEmailCheck();

   // 	if($pref::Net::DisconnectChat)
   //    		IRCClient::quit();  //this is screwed up right now ^^
   }

   checkGotLoadInfo();
}

function checkGotLoadInfo()
{
   if ( LoadingGui.gotLoadInfo )
      Canvas.setContent( LoadingGui );
   else
      LoadingGui.checkSchedule = schedule( 500, 0, checkGotLoadInfo );   
}

function cancelLoadInfoCheck()
{
   if ( LoadingGui.checkSchedule )
   {
      cancel( LoadingGui.checkSchedule );
      LoadingGui.checkSchedule = "";
   }
}

function DispatchLaunchMode()
{
   switch$($LaunchMode)
   {
      case "InteriorView":
         if ( isFile( "missions/interiorTest.mis" ) )
         {
            $InteriorArgument = $TestObjectFileName;
            $extension = fileExt( $TestObjectFileName );
            if ( stricmp( $extension, ".dif\"" ) == 0 ) 
            {
               // Have to adjust for quotes:
               $TestObjectFileName = getSubStr( $TestObjectFileName,
                                               1, strlen( $TestObjectFileName ) - 2 );
            }

            if ( getSubStr( $TestObjectFileName, strlen( $TestObjectFileName ) - 6, 1 ) $= "_" ) 
            {
               // Strip the detail part off...
               $TestObjectFileName = getSubStr( $TestObjectFileName, 0, strlen( $TestObjectFileName ) - 6 ) @ ".dif";
            }

            echo( $TestObjectFileName @ " is the file loaded" );

            $ServerName = $Host::GameName;
            $Host::TimeLimit = 60;
            CreateServer( "interiorTest", "InteriorTest" );
            localConnect( "TestGuy" );
         }
         else
            MessageBoxOK( "FILE NOT FOUND", "You do not have the interior test mission in your mission folder.\nTalk to Brad or Tom to get it.", "quit();" );
      case "Connect":
         OnlineLogIn();
         setNetPort(0);
         JoinGame($JoinGameAddress);
      case "HostGame":
         $ServerName = $Host::GameName;
         $Host::MissionType = $MissionType;
         $Host::Map = $Mission;
         CreateServer($Mission, $MissionType);
         localConnect();
      case "Normal":
         OnlineLogIn();
      case "Offline":
         PlayOffline();
      case "TSShow":
         startShow();
      case "SceneLight":
         CreateServer($Mission);
         localConnect();
      case "Demo":
         LoopDemos();
   }
}

// if($LaunchMode !$= "Demo")
//    VerifyCDCheck(DispatchLaunchMode);
// else
   DispatchLaunchMode();
