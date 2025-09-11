$PowerThread = 0;
$AmbientThread = 1; 
$ActivateThread = 2;
$DeployThread = 3;

$HumSound = 0;
$ActivateSound = 1;
$DeploySound = 2;
$PlaySound = 3;

//******************************************************************************
//*   Power  -Audio- Data Blocks                                               *
//******************************************************************************

datablock AudioProfile(BasePowerOn)
{
   filename    = "fx/powered/base_power_on.wav";
   description = Audio2D;
   preload = true;
};

datablock AudioProfile(BasePowerOff)
{
   filename    = "fx/powered/base_power_off.wav";
   description = Audio2D;
   preload = true;
};

datablock AudioProfile(BasePowerHum)
{
   filename    = "fx/powered/base_power_loop.wav";
   description = AudioLooping2D;
   preload = true;
};

//******************************************************************************
//*   Power  -  Functions                                                      *
//******************************************************************************

function GameBase::clearPower(%this)
{
}

function SimGroup::clearPower(%this)
{
	%this.powerCount = 0;
   for (%i = 0; %i < %this.getCount(); %i++)
   {
      %obj = %this.getObject(%i);
      if(%obj.getType() & $TypeMasks::GameBaseObjectType)
         %obj.clearPower();
   }
}

function SimObject::powerInit(%this, %powerCount)
{
	//function declared to reduce console error msg spam
}

function SimGroup::powerInit(%this, %powerCount)
{
   if(%this.providesPower)
      %powerCount++;

   %count = %this.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %obj = %this.getObject(%i);
      if(%obj.getType() & $TypeMasks::GameBaseObjectType)
      {
         if(%obj.getDatablock().isPowering(%obj))
            %powerCount++;
      }
   }
   %this.powerCount = %powerCount;
   for (%i = 0; %i < %this.getCount(); %i++)
   {
      %obj = %this.getObject(%i);
      %obj.powerInit(%powerCount);
   }
}

function GameBase::powerInit(%this, %powerCount)
{
	if(%powerCount)
	   %this.getDatablock().gainPower(%this);
	else
	   %this.getDataBlock().losePower(%this);
}

function SimObject::isPowering(%data, %obj)
{
   return false;
}

function Generator::isPowering(%data, %obj)
{
    return !%obj.isDisabled();
}

function SimObject::updatePowerCount()
{
}

function SimObject::powerCheck()
{
}


function SimGroup::updatePowerCount(%this, %value)
{
   if(%this.powerCount > 0 || %value > 0)
      %this.powerCount += %value;
   for (%i = 0; %i < %this.getCount(); %i++)
   {
      %this.getObject(%i).updatePowerCount(%value);
   }
   for (%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).powerCheck(%this.powerCount);
}

function GameBaseData::gainPower(%data, %obj)
{
}

function GameBaseData::losePower(%data, %obj)
{
}
 
function InteriorInstance::powerCheck(%this, %powerCount)
{
	if(%powerCount > 0)
		%mode = "Off";
	else
		%mode = "On";
   %this.setAlarmMode(%mode);
}

function GameBase::powerCheck(%this, %powerCount)
{
   if(%powerCount || %this.selfPower)
      %this.getDatablock().gainPower(%this);
   else
      %this.getDatablock().losePower(%this);
}

function GameBase::incPowerCount(%this)
{
   %this.getGroup().updatePowerCount(1);
}

function GameBase::decPowerCount(%this)
{
   %this.getGroup().updatePowerCount(-1);
}

function GameBase::setSelfPowered(%this)
{
   if(!%this.isPowered())
   {
      %this.selfPower = true;
		if(%this.getDatablock().deployedObject)
			%this.initDeploy = true;
      %this.getDataBlock().gainPower(%this);
   }
   else
      %this.selfPower = true;
}

function GameBase::clearSelfPowered(%this)
{
   %this.selfPower = "";
   if(!%this.isPowered())
      %this.getDataBlock().losePower(%this);
}

function GameBase::isPowered(%this)
{
   return %this.selfPower || %this.getGroup().powerCount > 0;
}
