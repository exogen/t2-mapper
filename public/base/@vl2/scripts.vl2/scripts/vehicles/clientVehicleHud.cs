//------------------------------------------------------------------------------
function VehicleHud::onWake( %this )
{
   VIN_RemainingText.setText( "" );
   VIN_BuyBtn.setActive( false );

   if ( isObject( hudMap ) )
   {
      hudMap.pop();
      hudMap.delete();
   }
   new ActionMap( hudMap );
   hudMap.blockBind( moveMap, toggleInventoryHud );
   hudMap.blockBind( moveMap, toggleScoreScreen );
   hudMap.blockBind( moveMap, toggleCommanderMap );
   hudMap.bindCmd( keyboard, escape, "", "VehicleHud.onCancel();" );
   hudMap.bindCmd( keyboard, "1", "", "VehicleHud.quickBuy( 0 );" );
   hudMap.bindCmd( keyboard, "2", "", "VehicleHud.quickBuy( 1 );" );
   hudMap.bindCmd( keyboard, "3", "", "VehicleHud.quickBuy( 2 );" );
   hudMap.bindCmd( keyboard, "4", "", "VehicleHud.quickBuy( 3 );" );
   hudMap.bindCmd( keyboard, "5", "", "VehicleHud.quickBuy( 4 );" );
   hudMap.bindCmd( keyboard, "6", "", "VehicleHud.quickBuy( 5 );" );
   hudMap.push();
}

//------------------------------------------------------------------------------
function VehicleHud::onSleep( %this )
{
   VIN_Picture.setBitmap( "" );

   %this.selId = "";
   %this.selected = "";

   // Don't rely on the server to tell us to clear the hud - do it now!
   for ( %line = 0; %line < $Hud['vehicleHud'].count; %line++ )
   {
      if ( $Hud['vehicleHud'].data[%line, 0] !$= "" )
      {
         $Hud['vehicleHud'].childGui.remove( $Hud['vehicleHud'].data[%line, 0] );
         $Hud['vehicleHud'].data[%line, 0] = "";
      }
   }
   $Hud['vehicleHud'].count = 0;

   hudMap.pop();
   hudMap.delete();
}

//------------------------------------------------------------------------------
function VehicleHud::setupHud( %obj, %tag )
{
   // Nothing to do...
}

//------------------------------------------------------------------------------
function VehicleHud::loadHud( %obj, %tag )
{
   $Hud[%tag] = VehicleHud;
   $Hud[%tag].childGui = VIN_Root;
   $Hud[%tag].parent = VIN_Root;
}

//------------------------------------------------------------------------------
function VehicleHud::quickBuy( %this, %id )
{
   if ( isObject( $Hud['vehicleHud'].data[%id, 0] ) )
   {
      if ( %this.selId != %id )
         VehicleHud.onTabSelect( %id, $Hud['vehicleHud'].data[%id, 0].vName, $Hud['vehicleHud'].data[%id, 0].vCount );
      %this.onBuy();
   }
}

//------------------------------------------------------------------------------
function VehicleHud::onBuy( %this )
{
   toggleCursorHuds( 'vehicleHud' );
   commandToServer( 'buyVehicle', %this.selected );
}

//------------------------------------------------------------------------------
function VehicleHud::onCancel( %this )
{
   toggleCursorHuds('vehicleHud');
}

//------------------------------------------------------------------------------
function VehicleHud::onTabSelect( %this, %id, %name, %count )
{
   if ( %this.selId !$= "" )
      $Hud['vehicleHud'].data[%this.selId, 0].setValue( false );

   %this.selId = %id;
   %this.selected = %name;

   VIN_Picture.setBitmap( "gui/vin_" @ %name );
   VIN_RemainingText.setText( %count SPC "Remaining" );
   VIN_BuyBtn.setActive( %count > 0 );
}

//------------------------------------------------------------------------------
function VehicleHud::addLine( %this, %tag, %lineNum, %name, %count )
{
   %yOffset = ( %lineNum * 30 ) + 11;
   $Hud[%tag].count++;

   $Hud[%tag].data[%lineNum, 0] = new ShellTabButton() {
      profile = "ShellTabProfile";
		horizSizing = "right";
		vertSizing = "bottom";
		position = "3 " @ %yOffset;
		extent = "206 38";
		minExtent = "8 8";
		visible = "1";
		helpTag = "0";
      command = "VehicleHud.onTabSelect(" @ %lineNum @ "," @ %name @ "," @ %count @ ");";
		text = "";
      vName = %name;
      vCount = %count;
	};

   // If nothing is selected, select something:
   if ( %this.selId $= "" )
   {
      $Hud[%tag].data[%lineNum, 0].setValue( true );
      VehicleHud.onTabSelect( %lineNum, %name, %count );
   }

   return 1;
}

//------------------------------------------------------------------------------
function clientCmdStationVehicleShowHud()
{
   if ( Canvas.getContent() != PlayGui.getId() )
      return;

   showHud( 'vehicleHud' );
	clientCmdTogglePlayHuds(false);
}

//------------------------------------------------------------------------------
function clientCmdStationVehicleHideHud()
{
   hideHud( 'vehicleHud' );
	clientCmdTogglePlayHuds(true);
}

function clientCmdStationVehicleHideJustHud()
{
   hideHud( 'vehicleHud' );
}