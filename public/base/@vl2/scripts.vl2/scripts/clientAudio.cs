//--------------------------------------------------------------------------
// 
// 
// 
//--------------------------------------------------------------------------

datablock EffectProfile(BountyBellEffect)
{
   effectname = "misc/bounty_bonus";
   minDistance = 2.5;
   maxDistance = 5.0;
};

// ordered list of providers
$AudioProviders[0, name]               = "Creative Labs EAX 2 (TM)";
$AudioProviders[0, isHardware]         = true;
$AudioProviders[0, enableEnvironment]  = true;

$AudioProviders[1, name]               = "Creative Labs EAX (TM)";
$AudioProviders[1, isHardware]         = true;
$AudioProviders[1, enableEnvironment]  = true;

$AudioProviders[2, name]               = "DirectSound3D Hardware Support";
$AudioProviders[2, isHardware]         = true;
$AudioProviders[2, enableEvironment]   = false;

$AudioProviders[3, name]               = "Miles Fast 2D Positional Audio";
$AudioProviders[3, isHardware]         = false;
$AudioProviders[3, enableEvironment]   = false;

// defaults
$Audio::defaultDriver = "miles";
$Audio::innerFalloffScale = "1.0";
$Audio::dynamicMemorySize = (1 << 20);

function audioIsHardwareProvider(%provider)
{
   for(%i = 0; $AudioProviders[%i, name] !$= ""; %i++)
      if(%provider $= $AudioProviders[%i, name])
         return($AudioProviders[%i, isHardware]);
   return(false);
}

function audioIsEnvironmentProvider(%provider)
{
   for(%i = 0; $AudioProviders[%i, name] !$= ""; %i++)
      if(%provider $= $AudioProviders[%i, name])
         return($AudioProviders[%i, enableEnvironment]);
   return(false);
}

function audioUpdateProvider(%provider)
{
   // check if should be using hardware settings by default
   alxDisableOuterFalloffs(false);
   for(%i = 0; $AudioProviders[%i, name] !$= ""; %i++)
   {
      if(%provider $= $AudioProviders[%i, name])
      {
         // hardware
         if($AudioProviders[%i, isHardware])
         {
            alxDisableOuterFalloffs(true);
            alxSetInnerFalloffScale(0.4);
         }

         // environment
         %enable = $pref::Audio::environmentEnabled && audioIsEnvironmentProvider(%provider);
         alxEnableEnvironmental(%enable);

         break;
      }
   }
}

function initAudio()
{
   $Audio::originalProvider = alxGetContexti(ALC_PROVIDER);

   %providerName = alxGetContextstr(ALC_PROVIDER_NAME, $Audio::originalProvider);
   audioUpdateProvider(%providerName);

   // voice?
   if($pref::Audio::enableVoiceCapture)
      $Audio::captureInitialized = alxCaptureInit();

   // Set volume based on prefs:
   alxListenerf( AL_GAIN_LINEAR, $pref::Audio::masterVolume );
   alxContexti( ALC_BUFFER_DYNAMIC_MEMORY_SIZE, $Audio::dynamicMemorySize );

   alxSetChannelVolume( $EffectAudioType, $pref::Audio::effectsVolume );
   alxSetChannelVolume( $VoiceAudioType, $pref::Audio::voiceVolume );
   alxSetChannelVolume( $ChatAudioType, $pref::Audio::radioVolume );
   alxSetChannelVolume( $MusicAudioType, $pref::Audio::musicVolume );
   alxSetChannelVolume( $GuiAudioType, $pref::Audio::guiVolume );
   alxSetChannelVolume( $RadioAudioType, $pref::Audio::radioVolume );

   alxSetCaptureGainScale( $pref::Audio::captureGainScale );
   
   // cap the codec levels
   if( $platform $= "linux" )
   {
      if( $pref::Audio::encodingLevel != 3)
         $pref::Audio::encodingLevel = 3;
      $pref::Audio::decodingMask &= 8;
   }
   else
   {
      if( $pref::Audio::encodingLevel > 2)
         $pref::Audio::encodingLevel = 2;
      $pref::Audio::decodingMask &= 7;
   }
}

if($Audio::initialized)
   initAudio();

//--------------------------------------------------------------------------
// MP3-Music player
new ScriptObject(MusicPlayer)
{
   class = MP3Audio;
   currentTrack = "";
   repeat = true;
};

function MP3Audio::stop(%this)
{
   alxStopMusic();
}

function getRandomTrack()
{
   if ( isDemo() )
      return( "desert" );
      
   %val = mFloor(getRandom(0, 4));
   switch(%val)
   {
      case 0:
         return "lush";
      case 1:
         return "volcanic";
      case 2:
         return "badlands";
      case 3:
         return "ice";
      case 4:
         return "desert";
   }
}

function MP3Audio::play(%this)
{
   if(%this.currentTrack $= "")
      %this.currentTrack = getRandomTrack();
   %this.playTrack(%this.currentTrack);
}   

function MP3Audio::playTrack(%this, %trackName)
{
   %this.currentTrack = %trackName;
   if($pref::Audio::musicEnabled)
   {
      if ( isDemo() )
         alxPlayMusic("demo_base\\music\\" @ %trackName @ ".mp3");
      else   
         alxPlayMusic("base\\music\\" @ %trackName @ ".mp3");
   }
}

function finishedMusicStream(%stopped)
{
   if(%stopped $= "true")
      return;

   if(MusicPlayer.repeat)                  
      MusicPlayer.playTrack(MusicPlayer.currentTrack);
}

function clientCmdPlayMusic(%trackname)
{
   if(%trackname !$= "")
      MusicPlayer.playTrack(%trackName);
}

function clientCmdStopMusic()
{
   MusicPlayer.stop();
}

//--------------------------------------
// Audio Profiles
//

new EffectProfile(eButtonDown)
{
   effectname = "gui/buttonDown";
   minDistance = 10;
};

new EffectProfile(eButtonOver)
{
   effectname = "gui/buttonOver";
   minDistance = 10;
};

new AudioDescription(AudioGui)
{
   volume   = 1.0;
   isLooping= false;
   is3D     = false;
   type     = $GuiAudioType;
};

new AudioDescription(AudioChat)
{
   volume   = 1.0;
   isLooping= false;
   is3D     = false;
   type     = $ChatAudioType;
};

new AudioDescription(AudioGuiLoop)
{
   volume   = 1.0;
   isLooping= true;
   is3D     = false;
   type     = $GuiAudioType;
};

new AudioProfile(sButtonDown)
{
   filename = "gui/buttonDown.wav";
   description = "audioGui";
	preload = true;
   effect = eButtonDown;
};

new AudioProfile(sButtonOver)
{
   filename = "gui/buttonOver.wav";
   description = "audioGui";
	preload = true;
   effect = eButtonOver;
};

new AudioProfile(sGotMail)
{
   filename = "gui/youvegotmail.wav";
   description = "audioGui";
	  preload = true;
};

new EffectProfile(eLaunchMenuOpen)
{
   effectname = "gui/launchMenuOpen";
   minDistance = 10;
};

new AudioProfile(sLaunchMenuOpen)
{
   filename = "gui/launchMenuOpen.wav";
   description = "audioGui";
	preload = true;
   effect = eLaunchMenuOpen;
};

new AudioProfile(sLaunchMenuOver)
{
   filename = "gui/buttonOver.wav";
   description = "audioGui";
	preload = true;
   effect = eButtonOver;
};

new AudioProfile(VoteForSound)
{
   filename = "gui/buttonOver.wav";
   description = "audioGui";
	  preload = true;
};
new AudioProfile(VoteAgainstSound)
{
   filename = "gui/buttonOver.wav";
   description = "audioGui";
	  preload = true;
};

new AudioProfile(TaskAcceptedSound)
{
   filename = "fx/misc/command_accept.wav";
   description = "audioGui";
	  preload = true;
};
new AudioProfile(TaskDeclinedSound)
{
   filename = "fx/misc/command_deny.wav";
   description = "audioGui";
	  preload = true;
};

new AudioProfile(TaskCompletedSound)
{
   filename = "fx/misc/command_complete.wav";
   description = "audioGui";
	  preload = true;
};

new AudioProfile(InputDeniedSound)
{
   filename = "fx/misc/diagnostic_beep.wav";
   description = "audioGui";
	  preload = true;
};

//--------------------------------------------------------------------------
//-------------------------------------- Shapebase lock/homing tones...
new AudioDescription(AudioLockTones)
{
   volume   = 1.0;
   isLooping= true;
   is3D     = false;
   type     = $EffectAudioType;
};

new AudioProfile(sSearchingTone)
// Sound that the FIRER hears when SEEKING a "hot" target
{
   filename = "fx/weapons/missile_firer_search.wav";
   description = "audioLockTones";
	  preload = true;
};

new AudioProfile(sLockedTone)
// Sound that the FIRER hears when a "hot" target is LOCKED
{
   filename = "fx/weapons/missile_firer_lock.wav";
   description = "audioLockTones";
	  preload = true;
};

new AudioProfile(sMissileLockWarningTone)
// Sound that the TARGET hears when a LOCK has been achieved
{
   filename = "fx/weapons/missile_target_lock.wav";
   description = "audioLockTones";
	  preload = true;
};

new AudioProfile(sMissileHomingWarningTone)
// Sound that the TARGET hears when a missile has been locked onto the target and is IN THE AIR
{
   filename = "fx/weapons/missile_target_inbound.wav";
   description = "audioLockTones";
	  preload = true;
};

//--------------------------------------------------------------------------

new AudioProfile(HudInventoryHumSound)
{
   filename    = "gui/inventory_hum.wav";
   description = "AudioGuiLoop";
	preload = true;
};

new EffectProfile(HudInventoryActivateEffect)
{
   effectname = "gui/inventory_on";
   minDistance = 10;
};

new AudioProfile(HudInventoryActivateSound)
{
   filename    = "gui/inventory_on.wav";
   description = "AudioGui";
	preload = true;
   effect      = HudInventoryActivateEffect;
};

new EffectProfile(HudInventoryDeactivateEffect)
{
   effectname = "gui/inventory_off";
   minDistance = 10;
};

new AudioProfile(HudInventoryDeactivateSound)
{
   filename    = "gui/inventory_off.wav";
   description = "AudioGui";
	preload = true;
   effect = HudInventoryDeactivateEffect;
};

new AudioProfile(CommandMapHumSound)
{
   filename    = "gui/command_hum.wav";
   description = "AudioGuiLoop";
	  preload = true;
};

new EffectProfile(CommandMapActivateEffect)
{
   effectname = "gui/command_on";
   minDistance = 10;
};

new AudioProfile(CommandMapActivateSound)
{
   filename    = "gui/command_on.wav";
   description = "AudioGui";
   effect      = CommandMapActivateEffect;
	preload = true;
};

new EffectProfile(CommandMapDeactivateEffect)
{
   effectname = "gui/command_off";
   minDistance = 10;
};

new AudioProfile(CommandMapDeactivateSound)
{
   filename    = "gui/command_off.wav";
   description = "AudioGui";
	preload = true;
   effect = CommandMapDeactivateEffect;
};

new AudioProfile(ShellScreenHumSound)
{
   filename    = "gui/shell_hum.wav";
   description = "AudioGuiLoop";
	  preload = true;
};

new AudioProfile(LoadingScreenSound)
{
   filename    = "gui/loading_hum.wav";
   description = "AudioGuiLoop";
	  preload = true;
};

new AudioProfile(VotePassSound)
{
   filename    = "fx/misc/vote_passes.wav";
   description = "AudioGui";
	  preload = true;
};

new AudioProfile(VoteNotPassSound)
{
   filename    = "fx/misc/vote_fails.wav";
   description = "AudioGui";
	preload = true;
};

new AudioProfile(AdminForceSound)
{
   filename    = "fx/misc/bounty_completed.wav";
   description = "AudioGui";
	preload = true;
};

new AudioProfile(VoteInitiatedSound)
{
   filename    = "fx/misc/vote_initiated.wav";
   description = "AudioGui";
	preload = true;
};

// Tinman - not being used anymore...
// new AudioProfile(OutOfBoundsSound)
// {
//    filename    = "gui/vote_nopass.wav";
//    description = "AudioGuiLoop";
// 	  preload = true;
// };

new AudioProfile(BountyBellSound)
{
   filename    = "fx/misc/bounty_bonus.wav";
   description = "AudioGui";
	preload = true;
};

new AudioProfile(SiegeSwitchSides)
{
   filename    = "fx/misc/siege_switching.wav";
   description = "AudioGui";
	preload = true;
};

new EffectProfile(ObjectiveCompletedEffect)
{
   effectname = "misc/bounty_bonus";
   minDistance = 10;
};

new AudioProfile(ObjectiveCompleted)
{
   filename    = "fx/misc/bounty_bonus.wav";
   description = "AudioGui";
   effect      = ObjectiveCompletedEffect;
   preload = true;
};

