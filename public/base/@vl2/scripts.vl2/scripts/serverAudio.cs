
//--------------------------------------
// Audio Descriptions
//

datablock AudioDescription(ProjectileLooping3d)
{
   volume   = 1.0;
   isLooping= true;

   is3D     = true;
   minDistance= 5.0;
   MaxDistance= 20.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(ClosestLooping3d)
{
   volume   = 1.0;
   isLooping= true;

   is3D     = true;
   minDistance= 5.0;
   MaxDistance= 30.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(CloseLooping3d)
{
   volume   = 1.0;
   isLooping= true;

   is3D     = true;
   minDistance= 10.0;
   MaxDistance= 50.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioDefaultLooping3d)
{
   volume   = 1.0;
   isLooping= true;

   is3D     = true;
   minDistance= 20.0;
   MaxDistance= 100.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioClosest3d)
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 5.0;
   MaxDistance= 30.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioClose3d)
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 10.0;
   MaxDistance= 60.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioDefault3d)
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 20.0;
   MaxDistance= 100.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioExplosion3d)
// Regular weapon explosions
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 20.0;
   MaxDistance= 150.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioBomb3d)
// Bomber Bombs
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 80.0;
   MaxDistance= 250.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioBIGExplosion3d)
// Big explosions like mortars, vehicles, and satchel charges
{
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 50.0;
   MaxDistance= 250.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(AudioLooping2D)
// Used for Looping Environmental Sounds
{
   volume = 1.0;
   isLooping = true;
   is3D = false;
   type = $EffectAudioType;
   environmentLevel = 1.0;
};

datablock AudioDescription(Audio2D)
// Used for non-looping environmental sounds (like power on, power off)
{
   volume = 1.0;
   isLooping = false;
   is3D = false;
   type = $EffectAudioType;
   environmentLevel = 1.0;
};

// Audio Environment Settings --- Used for EAX and EAX2 sounds //

datablock AudioEnvironment(Underwater)
{
   useRoom = true;
   room = UNDERWATER;
   effectVolume = 0.6;
};

datablock AudioEnvironment(BigRoom)
{
   useRoom = true;
   room = AUDITORIUM;
   effectVolume = 0.4;
};

datablock AudioEnvironment(SmallRoom)
{
   useRoom = true;
   room = STONEROOM;
   effectVolume = 0.4;
};

