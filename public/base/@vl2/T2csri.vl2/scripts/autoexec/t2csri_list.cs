// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Krash
// Copyright 2008 by Krash and the Tribes 2 Community System Reengineering Intitiative

// Master listing / Queries.

if ($Host::TN::beat $= "") $Host::TN::beat = 3; //Time between beats in minutes.
if ($Host::TN::echo $= "") $Host::TN::echo = 1; //Enable the MS echoes.


function NewsGui::onWake( %this )
{
   Canvas.pushDialog( LaunchToolbarDlg );
   %this.pane = "News";
   NM_TabView.setSelected( 1 );
}
function NM_TabView::onAdd( %this )
{
   %this.addSet( 1, "gui/shll_horztabbuttonB", "5 5 5", "50 50 0", "5 5 5" );
   %this.addTab(1,"NEWS",1);
   %this.addTab(2,"FORUMS");
   %this.setTabActive(2,0);
   %this.addTab(3,"DOWNLOADS");
   %this.setTabActive(3,0);
}
function NM_TabView::onSelect( %this, %id, %text )
{
   NM_NewsPane.setVisible( %id == 1 );
   //NM_ForumPane.setVisible( %id == 2 );
   //NM_FilePane.setVisible( %id == 3 );
   NM_TabFrame.setAltColor( %id == 1 );

   %ctrl = "NM_" @ NewsGui.pane @ "Pane";
   if ( isObject( %ctrl ) )
      %ctrl.onDeactivate();

   switch ( %id )
   {
      case 1:  // News
         NM_NewsPane.onActivate();
   }
}
function NM_NewsPane::onActivate(%this) {
   NewsGui.pane = "News";

}
function NM_NewsPane::onDeactivate(%this) {}
function NewsGui::setKey(%this) {}
function LaunchNews() {
if (!isObject(NewsGui)){
new GuiChunkedBitmapCtrl(NewsGui) {
	profile = "GuiContentProfile";
	horizSizing = "width";
	vertSizing = "height";
	position = "0 0";
	extent = "640 480";
	minExtent = "8 8";
	visible = "1";
	hideCursor = "0";
	bypassHideCursor = "0";
	variable = "$ShellBackground";
	helpTag = "0";
	useVariable = "1";

	new ShellPaneCtrl() {
		profile = "ShellPaneProfile";
		horizSizing = "width";
		vertSizing = "height";
		position = "12 13";
		extent = "620 423";
		minExtent = "48 92";
		visible = "1";
		hideCursor = "0";
		bypassHideCursor = "0";
		helpTag = "0";
		text = "TRIBESNEXT";
		maxLength = "255";
		noTitleBar = "0";

  
		new ShellTabFrame(NM_TabFrame) {
			profile = "ShellHorzTabFrameProfile";
			horizSizing = "width";
			vertSizing = "height";
			position = "22 54";
			extent = "576 351";
			minExtent = "26 254";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			isVertical = "0";
			useCloseButton = "0";
			edgeInset = "0";
		};
		new ShellTabGroupCtrl(NM_TabView) {
			profile = "TabGroupProfile";
			horizSizing = "width";
			vertSizing = "bottom";
			position = "30 25";
			extent = "560 29";
			minExtent = "38 29";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			glowOffset = "7";
			tabSpacing = "2";
			maxTabWidth = "150";
			stretchToFit = "0";
		};
		new GuiControl(NM_NewsPane) {
			profile = "GuiDefaultProfile";
			horizSizing = "width";
			vertSizing = "height";
			position = "0 0";
			extent = "586 423";
			minExtent = "8 8";
			visible = "0";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

		new ShellFieldCtrl(NewsPanel) {
			profile = "ShellFieldProfile";
			horizSizing = "width";
			vertSizing = "height";
			position = "31 92";
			extent = "559 315";
			minExtent = "16 18";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";

			new ShellScrollCtrl() {
				profile = "NewScrollCtrlProfile";
				horizSizing = "width";
				vertSizing = "height";
				position = "195 5";
				extent = "360 303";
				minExtent = "24 52";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				willFirstRespond = "1";
				hScrollBar = "alwaysOff";
				vScrollBar = "alwaysOn";
				constantThumbHeight = "0";
				defaultLineHeight = "15";
				childMargin = "0 2";
				fieldBase = "gui/shll_field";

				new GuiScrollContentCtrl() {
					profile = "GuiDefaultProfile";
					horizSizing = "width";
					vertSizing = "height";
					position = "4 6";
					extent = "336 291";
					minExtent = "8 8";
					visible = "1";
					hideCursor = "0";
					bypassHideCursor = "0";
					helpTag = "0";

					new GuiMLTextCtrl(NewsText) {
						profile = "NewTextEditProfile";
						horizSizing = "width";
						vertSizing = "bottom";
						position = "0 0";
						extent = "362 2376";
						minExtent = "8 8";
						visible = "1";
						hideCursor = "0";
						bypassHideCursor = "0";
						helpTag = "0";
						lineSpacing = "2";
						allowColorChars = "0";
						maxChars = "-1";
						deniedSound = "InputDeniedSound";
					};
				};
			};
			new ShellScrollCtrl() {
				profile = "NewScrollCtrlProfile";
				horizSizing = "right";
				vertSizing = "height";
				position = "2 21";
				extent = "195 287";
				minExtent = "24 52";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				willFirstRespond = "1";
				hScrollBar = "alwaysOff";
				vScrollBar = "dynamic";
				constantThumbHeight = "0";
				defaultLineHeight = "15";
				childMargin = "0 3";
				fieldBase = "gui/shll_field";

				new GuiScrollContentCtrl() {
					profile = "GuiDefaultProfile";
					horizSizing = "right";
					vertSizing = "bottom";
					position = "4 7";
					extent = "187 273";
					minExtent = "8 8";
					visible = "1";
					hideCursor = "0";
					bypassHideCursor = "0";
					helpTag = "0";

					new ShellTextList(NewsHeadlines) {
						profile = "ShellTextArrayProfile";
						horizSizing = "right";
						vertSizing = "bottom";
						position = "0 0";
						extent = "187 180";
						minExtent = "8 8";
						visible = "1";
						hideCursor = "0";
						bypassHideCursor = "0";
						helpTag = "0";
						enumerate = "0";
						resizeCell = "1";
						columns = "0";
						fitParentWidth = "1";
						clipColumnText = "0";
					};
				};
			};
			new GuiTextCtrl() {
				profile = "ShellAltTextProfile";
				horizSizing = "right";
				vertSizing = "bottom";
				position = "12 6";
				extent = "72 20";
				minExtent = "8 8";
				visible = "1";
				hideCursor = "0";
				bypassHideCursor = "0";
				helpTag = "0";
				text = "HEADLINES:";
				longTextBuffer = "0";
				maxLength = "255";
			};
		};

       };


	};
};
} else LaunchTabView.viewTab( "TRIBESNEXT", NewsGui, 0 );
}
//================================================================

function queryTNServers(%filter,%mod,%maptype,%minplayers,%maxplayers,%maxBots,%flags) {

    %server = "master.tribesnext.com:80";
    if (!isObject(TNbite))
      %bite = new TCPObject(TNbite){};
    else %bite = TNbite;
    %bite.mode = 0;
    %filename = "/list";
    if (%filter)
       %filename = "/list/"@%mod@"/"@%maptype@"/"@%minplayers@"/"@%maxplayers@"/"@%maxBots@"/"@%flags;
    if (%filter $= "types") {
       %filename = "/listtypes";
       %bite.mode = 2;
    } else queryFavoriteServers(); // Filtering fix, since the old master query isn't used.

    %bite.get(%server, %filename);
}

function queryMasterGameTypes(){
    clearGameTypes();
    clearMissionTypes();
    queryTNServers("types");
}

function queryMasterServer(%port, %flags, %rulesSet, %missionType, %minPlayers, %maxPlayers, %maxBots, %regionMask, %maxPing, %minCpu, %filtFlags, %buddy )
{
    if (%flags !$= "") queryTNServers(1,%rulesSet,%missionType,%minplayers,%maxplayers,%maxBots,%filtFlags SPC %buddy);
    else queryTNServers();
}

function TNbite::onLine(%this, %line) {
   if (trim(%line) $= "") {
     if (!%this.primed) %this.primed = true;
     if (%this.mode != 5) return;
   }
   if (!%this.primed) return;

   if (%this.mode == 1)
     switch (%line) {  // heartbeats
         case 0:  if ($Host::TN::echo) echo(" - Server added to list.");
         case 1:  if ($Host::TN::echo) { echo(" - Your server could not be contacted.");
                                       echo(" - Check your IP / port configuration."); }
         case 2:  if ($Host::TN::echo) echo(" - Heartbeat confirmed.");
     }
   else if (%this.mode == 2) //filter retrieval
     switch (firstWord(%line)) {
         case 0: addGameType( restWords(%line) );
         case 1: addMissionType( restWords(%line) );
     }
   else if (%this.mode == 5) // news retrieval
     NewsGui.addLine(%line);
   else  // and finally, the server list...
     if ( strpos(%line,":") != -1 && strstr(%line,".") != -1) {
       querySingleServer( %line );
       if (!%this.fnd) %this.fnd = true;
     }
}

function TNbite::onConnectFailed(%this) {
   if ($Host::TN::echo) echo("-- Could not connect to master server.");
}

function TNbite::onDNSFailed(%this) {
   if ($Host::TN::echo) echo("-- Could not connect to DNS server.");
}

function TNbite::onDisconnect(%this) {
   if (!%this.fnd && %this.mode == 0)
     if (!GMJ_Browser.rowCount())
       updateServerBrowserStatus( "No servers found.", 0 );
   %this.delete();
}

function TNbite::get(%this, %server, %query)
{
   %this.server = %server;
   %this.query = %query;
   %this.connect(%server);
}

function TNbite::onConnected(%this)
{
  if (%this.query !$= "") {
   %query = "GET " @ %this.query @ " HTTP/1.1\r\nHost: " @ %this.server @ "\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";
   %this.send(%query);
  }
}

function NewsGui::addLine( %this, %line ) {
   %this = NewsText;
   if (firstWord(%line) $= "<tag>") {
      %line = setWord(%line,0,"<tag:"@%this.index++@">");
      NewsHeadlines.addRow(%this.index,stripMLControlChars(%line));
   }
   if (%line $= "#EOF") {NewsText.upToDate = true; NewsHeadlines.setSelectedRow(0); return;}
   %text = %this.getText();
   %line = detag( %line );
   %text = (%text $= "") ? %line : %text NL %line;
   %this.setText( %text );
}

function NewsText::update( %this, %online ) {
   %this.setText("");
   NewsHeadlines.clear();
   %this.index = -1;
   if (%online) {
      %server = "www.tribesnext.com:80";
      if (!isObject(TNbite))
         %bite = new TCPObject(TNbite){};
      else %bite = TNbite;
      %bite.mode = 5;
      %filename = "/news";
      %bite.get(%server, %filename);
   }
}
function NewsHeadlines::onSelect( %this, %id, %text )
{
   NewsText.scrollToTag( %id );
}
//================================================================
package t2csri_webs {

function CheckEmail( %bool ) {
   if ($LaunchMode $= "Normal") return;  // Do nothing for now
   parent::CheckEmail( %bool );
}

function LaunchTabView::addLaunchTab( %this, %text, %gui, %makeInactive ) {
   // disable currently unused tabs
   if (%text $= "EMAIL" || %text $= "BROWSER") parent::addLaunchTab( %this, %text, %gui, 1 );
   else parent::addLaunchTab( %this, %text, %gui, %makeInactive );
}
function LaunchToolbarMenu::add(%this,%id,%text) {
   parent::add(%this,%id,%text);
   if ($PlayingOnline && %text $= "BROWSER") {
      LaunchToolbarMenu.add( 1, "TRAINING" );
      LaunchToolbarMenu.add( 2, "TRIBESNEXT" );
   }
}

function OpenLaunchTabs( %gotoWarriorSetup ) {
   parent::OpenLaunchTabs( %gotoWarriorSetup );
   if ($PlayingOnline && !TrainingGui.added) {
      LaunchTabView.addLaunchTab( "TRAINING",   TrainingGui );
      LaunchTabView.addLaunchTab( "TRIBESNEXT",       NewsGui );
      LaunchNews();
      NewsText.update(1);
      TrainingGui.added = true;
   }
}

function JoinSelectedGame() {
   if (($IPv4::InetAddress $= "" || strstr($IPv4::InetAddress,".") == -1) && $PlayingOnline) {
     messageBoxOK("IP ERROR","Your external address has not been set or is set incorrectly.  \n\nAttempting to reset...");
     ipv4_getInetAddress();
     return;
   } else parent::JoinSelectedGame();
}
function ClientReceivedDataBlock(%index, %total)
{
   DB_LoadingProgress.setValue( %index / %total );
   parent::ClientReceivedDataBlock(%index, %total);
}

function CreateServer(%mission, %missionType) {
   parent::CreateServer(%mission, %missionType);
   if (!isActivePackage(t2csri_server)) exec("t2csri/serverGlue.cs");
}

function StartHeartbeat() {
  if ($playingOnline) {
    if(isEventPending($TNBeat)) cancel($TNBeat);
    %server = "master.tribesnext.com:80";
    if ($Host::BindAddress !$= "")
      %path = "/add/" @ $Host::Port @"/"@ $Host::BindAddress;
    else %path = "/add/" @ $Host::Port;
    if (!isObject(TNbite))
      %bite = new TCPObject(TNbite){};
    else %bite = TNbite;
    %bite.mode = 1;
    %bite.get(%server, %path);
    if ($Host::TN::echo)
      echo("-- Sent heartbeat to TN Master. ("@%server@")");
    $TNBeat = schedule($Host::TN::beat*60000,0,"StartHeartBeat");
  } else parent::StartHeartbeat();
}

function StopHeartbeat() {
  if ($playingOnline) {
    if(isEventPending($TNBeat)) cancel($TNBeat);
  } else parent::StartHeartbeat();
}
//================================================================
};
if (!isActivePackage(t2csri_webs)) activatepackage (t2csri_webs);
