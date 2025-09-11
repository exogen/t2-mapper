//------------------------------------------------------------------------------
function RedBookCallback(%type)
{
   if(%type $= "PlayFinished")
      CDPlayer.playFinished();
}

//------------------------------------------------------------------------------
function CDAudio::playFinished(%this)
{
   if(%this.repeat == false)
      return;

   %this.play();
}

function CDAudio::play(%this)
{
   %numTracks = %this.getTrackCount();
   if(%numTracks == 0)
   {
      error(redbookGetLastError());
      return;
   }

   switch$(%this.playMode)
   {
      case "one_shot":
         %this.playTrack(%this.currentTrack);

      case "continuous":
         %this.currentTrack++;
         if(%this.currentTrack >= %numTracks)
            %this.currentTrack = 0;
         %this.playTrack(%this.currentTrack);

      case "random":
         %track = mFloor(getRandom() * (%numTracks + 1));
         if(%track >= %numTracks)
            %track = %numTracks - 1;
         %this.playTrack(%track);
   }
}

function CDAudio::playTrack(%this, %track)
{
   if(redbookPlay(%track) == false)
   {
      error(redbookGetLastError());
      %this.repeat = false;
      return;   
   }
   %this.currentTrack = %track;
}

function CDAudio::stop(%this)
{
   redbookStop();
}

function CDAudio::getTrackCount(%this)
{
   return(redbookGetTrackCount());
}

//------------------------------------------------------------------------------
new ScriptObject(CDPlayer)
{
   class = CDAudio;
   currentTrack = 0;
   playMode = "one_shot";
   repeat = true;
};

if($pref::Audio::musicEnabled)
{
   redbookOpen();
   redbookSetVolume($pref::Audio::musicVolume);
}

//------------------------------------------------------------------------------

function clientCmdPlayCDTrack(%track)
{
   if(%track $= "")
   {
      %numTracks = CDPlayer.getTrackCount();
      if(%numTracks == 0)
      {
         error(redbookGetLastError());
         return;
      }

      %track = mFloor(getRandom() * (%numTracks + 1));
      if(%track >= %numTracks)
         %track = %numTracks - 1;
   }
   
   CDPlayer.playTrack(%track);
}

function clientCmdStopCD()
{
   CDPlayer.stop();
}
