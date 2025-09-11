//--------------------------------------------------------------------------
// 
// 
// 
//--------------------------------------------------------------------------

function SimGroup::onTrigger(%this, %triggerId, %on)
{
   // Just relay the trigger event to all sub objects...
   //
   for (%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).onTrigger(%triggerId, %on);
}

function SimGroup::onTriggerTick(%this, %triggerId)
{
   // Just relay the trigger event to all sub objects...
   //
   for (%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).onTriggerTick(%triggerId);
}
