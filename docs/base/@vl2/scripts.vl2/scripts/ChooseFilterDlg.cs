//------------------------------------------------------------------------------
//
// ChooseFilterDlg.cs
//
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
function ChooseFilterDlg::onWake( %this )
{
   CF_FilterList.clear();
   CF_FilterList.addRow( 0, "All servers" );
   CF_FilterList.addRow( 1, "Servers with buddies" );
   CF_FilterList.addRow( 2, "Favorites only" );
   for ( %i = 0; $pref::ServerBrowser::Filter[%i] !$= ""; %i++ )
      CF_FilterList.addRow( %i + 3, $pref::ServerBrowser::Filter[%i] );

   if ( $pref::ServerBrowser::activeFilter >= %i + 3 )
      $pref::ServerBrowser::activeFilter = 0;

   CF_FilterList.setSelectedById( $pref::ServerBrowser::activeFilter );

	CF_GoBtn.makeFirstResponder( 1 );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::onSleep( %this )
{
   // export out all the filters...
   %count = CF_FilterList.rowCount();
   for ( %row = 3; %row < %count; %row++ )
      $pref::ServerBrowser::Filter[%row - 3] = CF_FilterList.getRowText( %row );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::newFilter( %this )
{
   // get an updated list of game types:
   queryMasterGameTypes();
   %this.editFilterIndex = CF_FilterList.rowCount();

   FilterEditName.setValue( "New Filter" );
   FilterEditGameType.setText( "Any" );
   FilterEditMissionType.setText( "Any" );
   FilterEditMinPlayers.setValue( 0 );
   FilterEditMaxPlayers.setValue( 255 );
   FilterEditMaxBots.setValue( 16 );
   FilterEditMinCPU.setValue( 0 );
   FilterEditUsePingTgl.setValue( false );
   FilterEditMaxPing.setValue( 50 );
   FilterEditMaxPing.setVisible( false );
   FilterEditTDOnTgl.setValue( false );
   FilterEditTDOffTgl.setValue( false );
   FilterEditWindowsTgl.setValue( false );
   FilterEditLinuxTgl.setValue( false );
   FilterEditDedicatedTgl.setValue( false );
   FilterEditNoPwdTgl.setValue( false );
   FilterEditCurVersionTgl.setValue( false );
   for ( %i = 0; isObject( "FilterEditLocMask" @ %i ); %i++ )
      ( "FilterEditLocMask" @ %i ).setValue( true );

   Canvas.pushDialog( FilterEditDlg );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::editFilter( %this )
{
   %rowId = CF_FilterList.getSelectedId();
   if ( %rowId < 3 ) // can't edit default filters
      return;

   // get an updated list of game types:
   queryMasterGameTypes();
   %rowText = CF_FilterList.getRowTextById( %rowId );
   %filterName = getField( %rowText, 0 );
   %gameType = getField( %rowText, 1 );
   if ( %gameType $= "" )
      %gameType = "Any";
   %misType = getField( %rowText, 2 );
   if ( %misType $= "" )
      %misType = "Any";
   %minPlayers = getField( %rowText, 3 );
   if ( %minPlayers $= "" )
      %minPlayers = 0;
   %maxPlayers = getField( %rowText, 4 );
   if ( %maxPlayers $= "" )
      %maxPlayers = 255;
   %regionCode = getField( %rowText, 5 );
   if ( %regionCode $= "" )
      %regionCode = 4294967295;
   %maxPing = getField( %rowText, 6 );
   %maxBots = getField( %rowText, 7 );
   if ( %maxBots $= "" )
      %maxBots = 16;
   %minCPU = getField( %rowText, 8 );
   if ( %minCPU $= "" )
      %minCPU = 0;
   %flags = getField( %rowText, 9 );
   
   FilterEditName.setValue( %filterName );
   FilterEditMinPlayers.setValue( %minPlayers );
   FilterEditMaxPlayers.setValue( %maxPlayers );
   FilterEditGameType.setText( %gameType );
   FilterEditMissionType.setText( %misType );
   %index = 0;
   while ( isObject( "FilterEditLocMask" @ %index ) )
   {
      ( "FilterEditLocMask" @ %index ).setValue( %regionCode & 1 );
      %index++;
      %regionCode >>= 1;
   }

   if ( %maxPing == 0 )
   {
      FilterEditUsePingTgl.setValue( false );
      FilterEditMaxPing.setValue( 50 );
      FilterEditMaxPing.setVisible( false );
   }
   else
   {
      FilterEditUsePingTgl.setValue( true );
      FilterEditMaxPing.setValue( %maxPing );
      FilterEditMaxPing.setVisible( true );
   }

   FilterEditMaxBots.setValue( %maxBots );
   FilterEditMinCPU.setValue( %minCPU );
   if ( %flags & 8 )
   {
      FilterEditWindowsTgl.setValue( true );
      FilterEditLinuxTgl.setValue( false );
   }
   else
   {
      FilterEditWindowsTgl.setValue( false );
      FilterEditLinuxTgl.setValue( %flags & 4 );
   }

   if ( %flags & 16 )
   {
      FilterEditTDOnTgl.setValue( true );
      FilterEditTDOffTgl.setValue( false );
   }
   else
   {
      FilterEditTDOnTgl.setValue( false );
      FilterEditTDOffTgl.setValue( %flags & 32 );
   }

   FilterEditDedicatedTgl.setValue( %flags & 1 );
   FilterEditNoPwdTgl.setValue( %flags & 2 );
   FilterEditCurVersionTgl.setValue( %flags & 128 );

   %this.editFilterIndex = %rowId;
   Canvas.pushDialog( FilterEditDlg );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::saveFilter( %this )
{
   %filterName = FilterEditName.getValue();
   %gameType = FilterEditGameType.getText();
   %misType = FilterEditMissionType.getText();
   %minPlayers = FilterEditMinPlayers.getValue();
   %maxPlayers = FilterEditMaxPlayers.getValue();
   %regionCode = 0;
   for ( %i = 0; isObject( "FilterEditLocMask" @ %i ); %i++ )
   {
      if ( ( "FilterEditLocMask" @ %i ).getValue() )
         %regionCode |= ( 1 << %i );
   }
   %maxPing = FilterEditUsePingTgl.getValue() ? FilterEditMaxPing.getValue() : 0;
   %maxBots = FilterEditMaxBots.getValue();
   %minCPU = FilterEditMinCPU.getValue();
   %flags = FilterEditDedicatedTgl.getValue()
     | ( FilterEditNoPwdTgl.getValue() << 1 )
     | ( FilterEditLinuxTgl.getValue() << 2 )
     | ( FilterEditWindowsTgl.getValue() << 3 )
     | ( FilterEditTDOnTgl.getValue() << 4 )
     | ( FilterEditTDOffTgl.getValue() << 5 )
     | ( FilterEditCurVersionTgl.getValue() << 7 );
   %row = %filterName TAB %gameType TAB %misType
        TAB %minPlayers TAB %maxPlayers TAB %regionCode 
        TAB %maxPing TAB %maxBots TAB %minCPU TAB %flags;
        
   CF_FilterList.setRowById( %this.editFilterIndex, %row );
   CF_FilterList.setSelectedById( %this.editFilterIndex );
   %this.editFilterIndex = "";
   Canvas.popDialog( FilterEditDlg );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::deleteFilter( %this )
{
   %rowId = CF_FilterList.getSelectedId();
   if ( %rowId < 3 ) // can't delete default filters
      return;

   %row = CF_FilterList.getRowNumById( %rowId );
   %lastFilter = CF_FilterList.rowCount() - 4;

   while ( ( %nextRow = CF_FilterList.getRowTextById( %rowId + 1 ) ) !$= "" )
   {
      CF_FilterList.setRowById( %rowId, %nextRow );
      %rowId++;
   }
   CF_FilterList.removeRowById( %rowId );

   // Get rid of the last filter (now extra):
   $pref::ServerBrowser::Filter[%lastFilter] = "";

   // Select next (or failing that, previous) filter:
   if ( CF_FilterList.getRowTextById( %row ) $= "" )
      %selId = CF_FilterList.getRowId( %row - 1 );
   else
      %selId = CF_FilterList.getRowId( %row );

   CF_FilterList.setSelectedById( %selId );
}

//------------------------------------------------------------------------------
function ChooseFilterDlg::go( %this )
{
   Canvas.popDialog( ChooseFilterDlg );
   GMJ_Browser.runQuery();
}

//------------------------------------------------------------------------------
function CF_FilterList::onSelect( %this, %id, %text )
{
	// Let the user know they can't edit or delete the default filters:
	if ( %id < 3 )
	{
		CF_EditFilterBtn.setActive( false );
		CF_DeleteFilterBtn.setActive( false );
	}
	else
	{
		CF_EditFilterBtn.setActive( true );
		CF_DeleteFilterBtn.setActive( true );
	}
   $pref::ServerBrowser::activeFilter = %id;
}

//------------------------------------------------------------------------------
function FilterEditDlg::setMinPlayers( %this )
{
	%newMin = FilterEditMinPlayers.getValue();
	if ( %newMin < 0 )
	{
		%newMin = 0;
		FilterEditMinPlayers.setValue( %newMin );
	}
	else if ( %newMin > 254 )
	{
		%newMin = 254;
		FilterEditMinPlayers.setValue( %newMin );
	}

	%newMax = FilterEditMaxPlayers.getValue();
	if ( %newMax <= %newMin )
	{
		%newMax = %newMin + 1;
		FilterEditMaxPlayers.setValue( %newMax );
	}
}

//------------------------------------------------------------------------------
function FilterEditDlg::setMaxPlayers( %this )
{
	%newMax = FilterEditMaxPlayers.getValue();
	if ( %newMax < 1 )
	{
		%newMax = 1;
		FilterEditMaxPlayers.setValue( %newMax );
	}
	else if ( %newMax > 255 )
	{
		%newMax = 255;
		FilterEditMaxPlayers.setValue( %newMax );
	}

	%newMin = FilterEditMinPlayers.getValue();
	if ( %newMin >= %newMax )
	{
		%newMin = %newMax - 1;
		FilterEditMinPlayers.setValue( %newMin );
	}
}

//------------------------------------------------------------------------------
function FilterEditDlg::setMaxBots( %this )
{
   %newMax = FilterEditMaxBots.getValue();
   if ( %newMax < 0 )
   {
      %newMax = 0;
      FilterEditMaxBots.setValue( %newMax );
   }
   else if ( %newMax > 16 )
   {
      %newMax = 16;
      FilterEditMaxBots.setValue( %newMax );
   }
}

//------------------------------------------------------------------------------
function FilterEditUsePingTgl::onAction( %this )
{
   FilterEditMaxPing.setVisible( %this.getValue() );
}

//------------------------------------------------------------------------------
function FilterEditDlg::setMaxPing( %this )
{
   %newMax = FilterEditMaxPing.getValue();
   if ( %newMax < 10 )
   {
      %newMax = 10;
      FilterEditMaxPing.setValue( %newMax );
   }
}

//------------------------------------------------------------------------------
function FilterEditDlg::setMinCPU( %this )
{
   %newMin = FilterEditMinCPU.getValue();
   if ( %newMin < 0 )
   {
      %newMin = 0;
      FilterEditMinCPU.setValue( %newMin );
   }
}

//------------------------------------------------------------------------------
function clearGameTypes()
{
   %text = FilterEditGameType.getText();
   FilterEditGameType.clear();
   FilterEditGameType.add( "Any", 0 );
   FilterEditGameType.add( "base", 1 );
   FilterEditGameType.add( "variant", 2 );
   FilterEditGameType.setText( %text );
}

//------------------------------------------------------------------------------
function addGameType( %type )
{
   if ( FilterEditGameType.findText( %type ) == -1 )
   {
      %id = FilterEditGameType.size();
      FilterEditGameType.add( %type, %id );
   }
}

//------------------------------------------------------------------------------
function clearMissionTypes()
{
   %text = FilterEditMissionType.getText();
   FilterEditMissionType.clear();
   FilterEditMissionType.add( "Any", 0 );
   FilterEditMissionType.setText( %text );
   
   // Add all the mission types found on this machine:
   for ( %i = 0; %i < $HostTypeCount; %i++ )
      FilterEditMissionType.add( $HostTypeDisplayName[%i], %i + 1 );
}

//------------------------------------------------------------------------------
function addMissionType(%type)
{
   if ( %type !$= "" && FilterEditMissionType.findText( %type ) == -1 )
   {
      %id = FilterEditMissionType.size();
      FilterEditMissionType.add( %type, %id );
   }
}

//------------------------------------------------------------------------------
function sortGameAndMissionTypeLists()
{
   FilterEditGameType.sort( true, 3 );
   %idx = FilterEditGameType.findText( FilterEditGameType.getText() );
   if ( %idx > -1 )
      FilterEditGameType.setSelected( %idx );
   FilterEditMissionType.sort( true, 1 );
   %idx = FilterEditMissionType.findText( FilterEditMissionType.getText() );
   if ( %idx > -1 )
      FilterEditMissionType.setSelected( %idx );
}

//------------------------------------------------------------------------------
function FilterEditTDOnTgl::onAction( %this )
{
   if ( %this.getValue() && FilterEditTDOffTgl.getValue() )
      FilterEditTDOffTgl.setValue( false );
}

//------------------------------------------------------------------------------
function FilterEditTDOffTgl::onAction( %this )
{
   if ( %this.getValue() && FilterEditTDOnTgl.getValue() )
      FilterEditTDOnTgl.setValue( false );
}

//------------------------------------------------------------------------------
function FilterEditWindowsTgl::onAction( %this )
{
   if ( %this.getValue() && FilterEditLinuxTgl.getValue() )
      FilterEditLinuxTgl.setValue( false );
}

//------------------------------------------------------------------------------
function FilterEditLinuxTgl::onAction( %this )
{
   if ( %this.getValue() && FilterEditWindowsTgl.getValue() )
      FilterEditWindowsTgl.setValue( false );
}

//------------------------------------------------------------------------------
// Make sure we still have at least one region selected:
function FilterEditDlg::checkRegionMasks( %this, %lastIndex )
{
   %index = 0;
   while ( isObject( "FilterEditLocMask" @ %index ) )
   {
      if ( ( "FilterEditLocMask" @ %index ).getValue() )   
         return;
      %index++;
   }

   // None are selected, so reselect the last control:
   ( "FilterEditLocMask" @ %lastIndex ).setValue( true );
}
