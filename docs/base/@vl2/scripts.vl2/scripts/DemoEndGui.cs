$DemoCycleDelay = 6000;

function DemoEndGui::onWake(%this)
{
   %this.index = 1;
   new ActionMap( DemoEndMap );
   DemoEndMap.bindCmd( mouse, button0, "DemoEndGui.forceBitmapCycle();", "" );
   DemoEndMap.bindCmd( keyboard, space, "DemoEndGui.forceBitmapCycle();", "" );
   DemoEndMap.push();
   %this.cycleTimer = %this.schedule($DemoCycleDelay, cycleBitmaps);
}

function DemoEndGui::cycleBitmaps(%this)
{
   if (%this.index == 3)
      quit();
   else
   {
      %this.index++;
      %this.setBitmap("gui/bg_DemoEnd" @ %this.index);
      %this.cycleTimer = %this.schedule( $DemoCycleDelay, cycleBitmaps );
   }
}

function DemoEndGui::forceBitmapCycle( %this )
{
   cancel( %this.cycleTimer );
   %this.cycleBitmaps();
}
