//------------------------------------------------------------------------------
//
// chatMenuHud.cs
//
//------------------------------------------------------------------------------

if ( isFile( "prefs/customVoiceBinds.cs" ) )
   $defaultVoiceBinds = false;
else
   $defaultVoiceBinds = true;

// Load in all of the installed chat items:
exec( "scripts/cannedChatItems.cs" );


//------------------------------------------------------------------------------
// Chat menu loading function:
new SimSet( ChatMenuList );   // Store all of the chat menu maps here so that we can delete them later:
function activateChatMenu( %filename )
{
   if ( isFile( %filename ) || isFile( %filename @ ".dso" ) )
   {
      // Clear the old chat menu:
      ChatMenuList.clear();

      // Create the root of the new menu:
      $RootChatMenu = new ActionMap();
      ChatMenuList.add( $RootChatMenu );
      $CurrentChatMenu = $RootChatMenu;
      $CurrentChatMenu.optionCount = 0;
      $CurrentChatMenu.bindCmd(keyboard, escape, "cancelChatMenu();", "");

      // Build the new chat menu:
      exec( %filename );
   }
   else
      error( "Chat menu file \"" @ %filename @ "\" not found!" );
}

//------------------------------------------------------------------------------
// Chat menu building functions:
function startChatMenu(%heading)
{
   %key = firstWord(%heading);
   %text = restWords(%heading);
   %menu = new ActionMap();
   ChatMenuList.add( %menu );
   %cm = $CurrentChatMenu;
   %cm.bindCmd(keyboard, %key, "setChatMenu(\"" @ %text @ "\", " @ %menu @ ");", "");
   %cm.option[%cm.optionCount] = %key @ ": " @ %text;
   %cm.command[%cm.optionCount] = %menu;  // Save this off here for later...
   %cm.isMenu[%cm.optionCount] = 1;
   %cm.optionCount++;
   %menu.parent = %cm;
   %menu.bindCmd(keyboard, escape, "cancelChatMenu();", "");
   %menu.optionCount = 0;
   $CurrentChatMenu = %menu;
}

function endChatMenu()
{
   $CurrentChatMenu = $CurrentChatMenu.parent;
}

function addChat(%keyDesc, %command)
{
   %key = firstWord(%keyDesc);
   %text = restWords(%keyDesc);
   %cm = $CurrentChatMenu;
   %cm.bindCmd(keyboard, %key, "issueChatCmd(" @ %cm @ "," @ %cm.optionCount @ ");", "");
   %cm.option[%cm.optionCount] = %key @ ": " @ %text;
   %cm.command[%cm.optionCount] = %command;
   %cm.isMenu[%cm.optionCount] = 0;
   %cm.optionCount++;
}


//------------------------------------------------------------------------------
// Chat menu hud functions:
$ChatMenuHudLineCount = 0;
function activateChatMenuHud( %make )
{
   if(%make && !TaskHudDlg.isVisible())
      showChatMenuHud();
}

function showChatMenuHud()
{
   Canvas.pushDialog(ChatMenuHudDlg);
   ChatMenuHudDlg.setVisible(true);
   setChatMenu(Root, $RootChatMenu);
}

function cancelChatMenu()
{
   $CurrentChatMenu.pop();
   $CurrentChatMenu = $RootChatMenu;
   Canvas.popDialog(ChatMenuHudDlg);
   ChatMenuHudDlg.setVisible(false);
}

function setChatMenu( %name, %menu )
{
   for ( %i = 0; %i < $ChatMenuHudLineCount; %i++ )
      chatMenuHud.remove( $ChatMenuHudText[%i] );

   $ChatMenuHudLineCount = %menu.optionCount + 1;
   chatMenuHud.extent = "170" SPC ( $ChatMenuHudLineCount * 15 ) + 8;

   // First add the menu title line:
   $ChatMenuHudText[0] = new GuiTextCtrl()
   {
      profile = "GuiHudVoiceMenuProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "5 3";
      extent = "165 20";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";
      helpTag = "0";
      text = "\c2" @ %name @ " Menu:";
   };
   chatMenuHud.add( $ChatMenuHudText[0] );

   // Now add all of the menu options:
   for ( %option = 0; %option < %menu.optionCount; %option++ )
   {
      %yOffset = ( %option * 15 ) + 18;

      if ( %menu.isMenu[%option] == 1 )
      {
         $ChatMenuHudText[%option + 1] = new GuiTextCtrl()
         {
            profile = "GuiHudVoiceMenuProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "5 " @ %yOffset;
            extent = "165 20";
            minExtent = "8 8";
            visible = "1";
            setFirstResponder = "0";
            modal = "1";
            helpTag = "0";
            text = "  " @ %menu.option[%option];
         };
      }
      else
      {
         $ChatMenuHudText[%option + 1] = new GuiTextCtrl()
         {
            profile = "GuiHudVoiceCommandProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "5 " @ %yOffset;
            extent = "165 20";
            minExtent = "8 8";
            visible = "1";
            setFirstResponder = "0";
            modal = "1";
            helpTag = "0";
            text = "  " @ %menu.option[%option];
         };
      }

      chatMenuHud.add( $ChatMenuHudText[%option + 1] );
   }

   //bind "anykey" to closing the chat menu, so if you press an invalid entry, you don't accidently
   //open the commander map or something...
   %menu.bindCmd(keyboard, "anykey", "cancelChatMenu();", "");

   // Pop the old menu map and push the new menu's map:
   $CurrentChatMenu.pop();
   $CurrentChatMenu = %menu;
   %menu.push();
}

function issueChatCmd( %menu, %index )
{
   processChatItemCallbacks( %menu.command[%index] );
   commandToServer( 'CannedChat', %menu.command[%index], false );
   cancelChatMenu();
}


//------------------------------------------------------------------------------
// Canned chat handler:
function serverCmdCannedChat( %client, %command, %fromAI )
{
   %cmdCode = getWord( %command, 0 );
   %cmdId = getSubStr( %cmdCode, 1, strlen( %command ) - 1 );
   %cmdString = getWord( %command, 1 );
   if ( %cmdString $= "" )
      %cmdString = getTaggedString( %cmdCode );

   if ( !isObject( $ChatTable[%cmdId] ) )
   {
      error( %cmdString @ " is not a recognized canned chat command." );
      return;
   }

   %chatItem = $ChatTable[%cmdId];
   
   //if there is text
   if (%chatItem.text !$= "" || !%chatItem.play3D)
   {
      %message = %chatItem.text @ "~w" @ %chatItem.audioFile;

      if ( %chatItem.teamOnly )
         cannedChatMessageTeam( %client, %client.team, '\c3%1: %2', %client.name, %message, %chatItem.defaultKeys );
      else
         cannedChatMessageAll( %client, '\c4%1: %2', %client.name, %message, %chatItem.defaultKeys );
   }

   //if no text, see if the audio is to be played in 3D...
   else if ( %chatItem.play3D && %client.player )
      playTargetAudio(%client.target, addTaggedString(%chatItem.audioFile), AudioClosest3d, true);

   if ( %chatItem.animation !$= "" )
      serverCmdPlayAnim(%client, %chatItem.animation);

   // Let the AI respond to the canned chat messages (from humans only)
   if (!%fromAI)
      CreateVoiceServerTask(%client, %cmdCode);
}

if ( $defaultVoiceBinds )
   activateChatMenu( "scripts/voiceBinds.cs" );
else
   activateChatMenu( "prefs/customVoiceBinds.cs" );

