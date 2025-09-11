$voiceLines = 8;
$voiceLineTimeout = 7 * 1000;
$numTalking = 0;

//------------------------------------------------------------------------------
function clientCmdPlayerStartTalking(%client, %success)
{
	// if more people are talking than we can handle, don't bother with names
	if($numTalking > $voiceLines)
		return;

	%openLine = -1;
	for(%i = 0; %i < $voiceLines; %i++)
	{
		if($voiceComm[%i] <= 0)
		{
			%openLine = %i;
			break;
		}
	}
	if(%openLine != -1)
	{
		$voiceComm[%openLine] = %client;
		if(%success)
			addGreenVoiceLine(%client, %openLine);
		else
			addRedVoiceLine(%client, %openLine);
		$numTalking++;
		resizeVoiceCommWindow();
		if(!(voiceCommHud.isVisible()))
			voiceCommHud.setVisible(true);
	}
}

//------------------------------------------------------------------------------
function clientCmdPlayerStoppedTalking(%client, %success)
{
	%doneLine = -1;
	for(%i = 0; %i < $voiceLines; %i++) {
		if($voiceComm[%i] == %client) {
			%doneLine = %i;
			break;
		}
	}
	if(%doneLine != -1)
		%rmSuccess = removeVoiceLine(%doneLine);
}

//------------------------------------------------------------------------------
function addGreenVoiceLine(%client, %line)
{
	%name = "Unknown client";
   %player = $PlayerList[%client];

   if(%player)
      %name = %player.name;

	%speakLine = new GuiControl("VCH"@%line) {
		profile = "GuiDefaultProfile";
      horizSizing = "right";
      vertSizing = "bottom";
		position = "2 " @ (%line + 1) * 15;
		extent = "160 15";
		visible = true;

		new GuiBitmapCtrl() {
			profile = "GuiDefaultProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			bitmap = "gui/hud_chat_button_on";
			position = "0 0";
			extent = "15 15";
			visible = true;
		};

		new GuiTextCtrl() {
	      profile = "GuiVoiceGreenProfile";
         horizSizing = "right";
         vertSizing = "bottom";
	      position = "20 0";
	      extent = "140 15";
	      text = %name;
	      visible = true;
	   };
	};
   voiceCommHud.add(%speakLine);
	schedule($voiceLineTimeout, 0, "removeVoiceLine", %line);
}

//------------------------------------------------------------------------------
function addRedVoiceLine(%client, %line)
{
	%name = "Unknown client";

   %player = $PlayerList[%client];
   if(%player)
      %name = %player.name;

	%speakLine = new GuiControl("VCH"@%line) {
		profile = "GuiDefaultProfile";
      horizSizing = "right";
      vertSizing = "bottom";
		position = "3 " @ (%line + 1) * 15;
		extent = "150 15";
		visible = true;

		new GuiBitmapCtrl() {
			profile = "GuiDefaultProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			bitmap = "gui/hud_chat_button_off";
			position = "0 0";
			extent = "15 15";
			visible = true;
		};

		new GuiTextCtrl() {
	      profile = "GuiVoiceGreenProfile";
         horizSizing = "right";
         vertSizing = "bottom";
	      position = "20 0";
	      extent = "125 15";
	      text = %name;
	      visible = true;
	   };
	};
   voiceCommHud.add(%speakLine);
	schedule($voiceLineTimeout, 0, "removeVoiceLine", %line);
}

//------------------------------------------------------------------------------
function removeVoiceLine(%line)
{
	%killIt = nameToID("VCH" @ %line);
	$voiceComm[%line] = 0;
	if(%killIt == -1) {
		//error("Could not find control VCH" @ %line @ " !!!!");
		return 0;
	}
	else {
		//error("Removing voice line " @ %line);
		%killIt.delete();
		$voiceComm[%line] = 0;
		$numTalking--;
		if($numTalking < 1)
			voiceCommHud.setVisible(false);
		resizeVoiceCommWindow();
		return 1;
	}
}

function resizeVoiceCommWindow()
{
	%lastLine = -1;
	for(%i = 0; %i < $voiceLines; %i++)
	{
		if($voiceComm[%i] > 0)
			%lastLine = %i;
	}
	%yExt = ((%lastLine + 1) * 15) + 18;
	%xExt = firstWord(voiceCommHud.extent);
	voiceCommHud.extent = %xExt SPC %yExt;
}
//------------------------------------------------------------------------------
// SERVER command functions:
//------------------------------------------------------------------------------
function serverCmdListenTo(%client, %who, %boolean)
{
   if ( %client == %who )
      return;

   %client.listenTo( %who, %boolean );

   if ( %echo )
   {
      if ( %boolean )
         messageClient( %client, 'MsgVoiceEnable', 'You will now listen to %3.', %boolean, %who, %who.name );
      else
         messageClient( %client, 'MsgVoiceEnable', 'You will no longer listen to %3.', %boolean, %who, %who.name );
   }
   else
      messageClient( %client, 'MsgVoiceEnable', "", %boolean, %who );

   messageClient( %who, 'MsgListenState', "", %boolean, %client );
}   

//------------------------------------------------------------------------------
function serverCmdListenToAll(%client)
{
   %client.listenToAll();

   for ( %i = 0; %i < ClientGroup.getCount(); %i++ )
   {
      %cl = ClientGroup.getObject( %i );
      if ( %cl && %cl != %client && !%cl.isAIControlled() )
         messageClient( %client, 'MsgVoiceEnable', "", true, %cl );
   }

   messageAllExcept( %client, 'MsgListenState', "", true, %client );
}   

//------------------------------------------------------------------------------
function serverCmdListenToNone(%client)
{
   %client.listenToNone();

   for ( %i = 0; %i < ClientGroup.getCount(); %i++ )
   {
      %cl = ClientGroup.getObject( %i );
      if ( %cl && %cl != %client && !%cl.isAIControlled() )
         messageClient( %client, 'MsgVoiceEnable', "", false, %cl );
   }

   messageAllExcept( %client, 'MsgListenState', "", false, %client );
}   

//------------------------------------------------------------------------------
// Client bind functions:
//------------------------------------------------------------------------------
function voiceCapStart()
{
   $voiceCaptureStarted = true;

   // client can send voice? (dont bother recording.. server will reject it anyway)
   if(($Audio::serverChannels == 0) || ($Audio::serverEncodingLevel < $pref::Audio::encodingLevel))
   {
      if($Audio::serverChannels == 0)
         addMessageHudLine("\c2System:\cr server has disabled voice communication.");
      else
      {
         switch($Audio::serverEncodingLevel)
         {
            case 0:   %level = "Codec .v12";
            case 1:   %level = "Codec .v24";
            case 2:   %level = "Codec .v29";
            default:  %level = "Codec GSM";
         }

         addMessageHudLine("\c2System:\cr server has voice level capped at [\c1" @ %level @ "\cr].");
      }

      $voiceCaptureStarted = false;
      return;
   }

   vcRecordingHud.setVisible(true);
	voiceCommHud.setVisible(true);
	resizeVoiceCommWindow();
   alxCaptureStart();
}

function voiceCapStop()
{
   if(!$voiceCaptureStarted)
      return;

   vcRecordingHud.setVisible(false);
	if($numTalking < 1)
		voiceCommHud.setVisible(false);
   alxCaptureStop();
}

//------------------------------------------------------------------------------
function serverCmdSetVoiceInfo(%client, %channels, %decodingMask, %encodingLevel)
{
   %wasEnabled = %client.listenEnabled();

   // server has voice comm turned off?
   if($Audio::maxVoiceChannels == 0)
      %decodingMask = 0;
   else
      %decodingMask &= (1 << ($Audio::maxEncodingLevel + 1)) - 1;

   if($Audio::maxEncodingLevel < %encodingLevel)
      %encodingLevel = $Audio::maxEncodingLevel;

   if($Audio::maxVoiceChannels < %channels)
      %channels = $Audio::maxVoiceChannels; 

   %client.setVoiceChannels(%channels);
   %client.setVoiceDecodingMask(%decodingMask);
   %client.setVoiceEncodingLevel(%encodingLevel);

   commandToClient(%client, 'SetVoiceInfo', %channels, %decodingMask, %encodingLevel);

   if ( %wasEnabled != ( %channels > 0 ) )
      updateCanListenState( %client );
}

//------------------------------------------------------------------------------
// SERVER side update function:
//------------------------------------------------------------------------------
function updateCanListenState( %client )
{
   // These can never listen, so they don't need to be updated:
   if ( %client.isAIControlled() || !%client.listenEnabled() )
      return;

   for ( %i = 0; %i < ClientGroup.getCount(); %i++ )
   {
      %cl = ClientGroup.getObject( %i );
      if ( %cl && %cl != %client && !%cl.isAIControlled() )
      {
         messageClient( %cl, 'MsgCanListen', "", %client.canListenTo( %cl ), %client );
         messageClient( %client, 'MsgCanListen', "", %cl.canListenTo( %client ), %cl );
      }
   }
}

//------------------------------------------------------------------------------
// CLIENT side handler functions:
//------------------------------------------------------------------------------
addMessageCallback( 'MsgVoiceEnable', handleVoiceEnableMessage );

function handleVoiceEnableMessage( %msgType, %msgString, %enabled, %who )
{
   if ( isObject( $PlayerList[%who] ) )
   {
      $PlayerList[%who].voiceEnabled = %enabled;
      lobbyUpdatePlayer( %who );
      if ( $PlayingOnline && !$PlayerList[%who].isSmurf && $PlayerList[%who].guid > 0 )
         setPlayerVoiceMuted( $PlayerList[%who].guid, !%enabled );
   }
}

//------------------------------------------------------------------------------
addMessageCallback( 'MsgCanListen', handleCanListenMessage );

function handleCanListenMessage( %msgType, %msgString, %canListen, %who )
{
   if ( isObject( $PlayerList[%who] ) )
   {
      $PlayerList[%who].canListen = %canListen;
      lobbyUpdatePlayer( %who );
   }
}

//------------------------------------------------------------------------------
addMessageCallback( 'MsgListenState', handleListenStateMessage );

function handleListenStateMessage( %msgType, %msgString, %isListening, %who )
{
   if ( isObject( $PlayerList[%who] ) )
   {
      $PlayerList[%who].isListening = %isListening;
      lobbyUpdatePlayer( %who );
   }
}
