// #author = |C|-DEbig3
// #warrior =  DEbig3
// #Rewritten By = DarkTiger
// version 1.0
$statusHudStats::maxPing  = -10000;
$statusHudStats::minPing =  10000;
package statusHudPackage {
   function toggleNetDisplayHud(%val)
   {
      if(%val)
      {
        $statusHudStatsCounter++;
         if($statusHudStatsCounter == 1)
         {
            NetGraphHudFrame.setVisible(false);
            NetBarHudFrame.setVisible(true);
            statusHudHud.setVisible(false);
            statusHudHud.setPosition(getWord(netGraphHudFrame.getPosition(),0),getWord(netGraphHudFrame.getPosition(),1));
         }
         else if($statusHudStatsCounter == 2)
         {
            netGraphHudFrame.setVisible(true);
            netBarHudFrame.setVisible(false);
            statusHudHud.setVisible(false);
            statusHudHud.setPosition(getWord(netGraphHudFrame.getPosition(),0),getWord(netGraphHudFrame.getPosition(),1));
         }
         else if($statusHudStatsCounter == 3){
            NetGraphHudFrame.setVisible(false);
            NetBarHudFrame.setVisible(false);
            if(!isObject(statusHudHud))
               statusHudBuild();
            statusHudHud.setVisible(true);
            statusHudHud.setPosition(getWord(netGraphHudFrame.getPosition(),0),getWord(netGraphHudFrame.getPosition(),1));
         }
         else if($statusHudStatsCounter == 4){
            NetGraphHudFrame.setVisible(true);
            NetBarHudFrame.setVisible(false);
            statusHudHud.setVisible(true);
            statusHudHud.setPosition(getWords(NetGraphHudFrame.getPosition(),0) - getWord(NetGraphHudFrame.getExtent(),0),getWords(NetGraphHudFrame.getPosition(),1));
         }
         else{
            $statusHudStatsCounter = 0; 
            NetGraphHudFrame.setVisible(false);
            NetBarHudFrame.setVisible(false);
            statusHudHud.setVisible(false);
            statusHudHud.setPosition(getWord(netGraphHudFrame.getPosition(),0),getWord(netGraphHudFrame.getPosition(),1));
         }
      }
   }
function NetBarHud::infoUpdate(%this, %ping, %packetLoss, %sendPackets, %sendBytes, %receivePackets, %receiveBytes) {
	parent::infoUpdate(%this, %ping, %packetLoss, %sendPackets, %sendBytes, %receivePackets, %receiveBytes);
	%dtms = getSimTime() - $statusHudStats::pingSpikeTime;
	$statusHudStats::pingSpikeTime = getSimTime();
	if(isObject(statusHudHud) && $statusHudStatsCounter > 2){
      statusHudHud.ppSCurrent.setText("<color:dcdcdc>" @ mFormatFloat(%sendPackets, "%4.0f"));
      statusHudHud.ppRCurrent.setText("<color:00bef0>" @ mFormatFloat(%receivePackets, "%4.0f"));
      statusHudHud.txCurrent.setText("<color:0078aa>" @ mFormatFloat(%sendBytes, "%4.0f"));
      statusHudHud.rxCurrent.setText("<color:787878>" @ mFormatFloat(%receiveBytes, "%4.0f"));
      $statusHudStats::totalPing += %ping;
      $statusHudStats::pingcount++;  
      if(%ping > 500){
         $statusHudStats::lagSec += %dtms;
         statusHudHud.lagMSCurrent.setText("<color:ff0000>" @ mFormatFloat($statusHudStats::lagSec/1000, "%4.1f"));
         $statusHudStats::lastlag = getSimTime();
      }
      else if(getSimTime() - $statusHudStats::lastlag > 60000){
         statusHudHud.lagMSCurrent.setText("<color:00bef0>" @ mFormatFloat($statusHudStats::lagSec/1000, "%4.1f"));
         if(getSimTime() - $statusHudStats::lastlag > (60000 * 5)){
            $statusHudStats::lagSec = 0;
            statusHudHud.lagMSCurrent.setText(mFormatFloat($statusHudStats::lagSec/1000, "%4.1f"));
         }
      }
      %pingAvgReset = 0;
      if($statusHudStats::totalPing > 60000){
         $statusHudStats::totalPing = $statusHudStats::totalPing * 0.5;
         $statusHudStats::pingcount = $statusHudStats::pingcount * 0.5;
         $statusHudStats::maxPing  = -10000;
         $statusHudStats::minPing =  10000;
         %pingAvgReset = 1;
      }
      if($statusHudStats::flCount++ > 12){
         $statusHudStats::fl = $statusHudStats::flMax - $statusHudStats::flMin;
         $statusHudStats::flMax  = -10000;
         $statusHudStats::flMin =  10000;
         $statusHudStats::flCount = 0;
      }
      else{
         $statusHudStats::flMax = (%ping > $statusHudStats::flMax) ? %ping : $statusHudStats::flMax;
         $statusHudStats::flMin = (%ping < $statusHudStats::flMin) ? %ping : $statusHudStats::flMin;  
      }
      
      $statusHudStats::avgping= $statusHudStats::totalPing / $statusHudStats::pingcount; 
      if(%pingAvgReset)
         statusHudHud.pingAvgCurrent.setText("<color:ff0000>" @ mFormatFloat($statusHudStats::avgping, "%4.0f"));  
      else  
         statusHudHud.pingAvgCurrent.setText(mFormatFloat($statusHudStats::avgping, "%4.0f"));  
      
      $statusHudStats::maxPing = (%ping > $statusHudStats::maxPing) ? %ping : $statusHudStats::maxPing;
      $statusHudStats::minPing = (%ping < $statusHudStats::minPing) ? %ping : $statusHudStats::minPing;
      
      %speed = mFloor(getControlObjectSpeed());
      %alt = getControlObjectAltitude();
      %fps = $fps::real;
      if (%fps > $statusHudStats::maxfps)
         $statusHudStats::maxfps = %fps;
      %x = strstr($statusHudStats::avgfps, ".");
      %avgfps = getSubStr($statusHudStats::avgfps, 0, %x + 2);
      $statusHudStats::fpscount++;
      $statusHudStats::totalfps += %fps;
      %fpsReset = 0;
      if($statusHudStats::totalfps > 50000){
         $statusHudStats::totalfps *= 0.5;
         $statusHudStats::fpscount *= 0.5;
         $statusHudStats::maxfps = 0;
         %fpsReset = 1;
      }
      $statusHudStats::avgfps = $statusHudStats::totalfps / $statusHudStats::fpscount;
      if(%fpsReset){
         statusHudHud.fpscurrent.setText("<color:FF0000>" @ %fps);
         statusHudHud.fpsaverage.setText("<color:FF0000>" @ %avgfps);
         statusHudHud.fpsmax.setText("<color:FF0000>" @ $statusHudStats::maxfps);
      }
      else{
         statusHudHud.fpscurrent.setText(%fps);
         statusHudHud.fpsaverage.setText(%avgfps);
         statusHudHud.fpsmax.setText($statusHudStats::maxfps);  
      }
      statusHudHud.ping.setText("<color:00FF00>" @ mFormatFloat(%ping, "%4.0f"));
      if(!isObject($statusHudStats::plObj)){
         $statusHudStats::plObj = getPLID();// to handel packet loss as the client side value is not correct
      }
      if(isObject($statusHudStats::plObj)){
         $statusHudStats::plupdate += %dtms;
         if($statusHudStats::plupdate > 4000){
            commandToServer( 'getScores' );
            $statusHudStats::plupdate = 0;
         }
         statusHudHud.pl.setText("<color:FF0000>" @  mFormatFloat($statusHudStats::plObj.packetLoss, "%3.0f"));
      }
      else{
        statusHudHud.pl.setText("<color:FF0000>" @  mFormatFloat(%packetLoss, "%3.0f")); 
      }
      statusHudHud.speed.setText(%speed);
      statusHudHud.altitude.setText(%alt);
      
      if(%pingAvgReset){
         statusHudHud.pingMinCurrent.setText("<color:FF0000>" @ mFloor($statusHudStats::minPing));
         statusHudHud.pingMaxCurrent.setText("<color:FF0000>" @ mFloor($statusHudStats::maxPing));
         statusHudHud.pingFluxCurrent.setText("<color:FF0000>" @ mFloor($statusHudStats::fl));
      }
      else{
         statusHudHud.pingMinCurrent.setText(mFloor($statusHudStats::minPing));
         statusHudHud.pingMaxCurrent.setText(mFloor($statusHudStats::maxPing));
         statusHudHud.pingFluxCurrent.setText(mFloor($statusHudStats::fl));
      }
	}
}
function getPLID(){
   %name = stripTrailingSpaces( strToPlayerName( getField( $pref::Player[$pref::Player::Current], 0 ) ) );
    for (%i = 0; %i < PlayerListGroup.getCount(); %i++) { // the client list
      %id = PlayerListGroup.getObject(%i);
      %fullName = stripChars(%id.name,"\cp\co\c6\c7\c8\c9\x10\x11");
         if(strlwr(%fullName) $= strlwr(%name)){
            return %id;
         }
    }
}
function statusHudBuild() {
	if (isObject(statusHudHud)) {
		statusHudHud.delete();
	}
	$statusHud = new ShellFieldCtrl(statusHudHud) {
			profile = "GuiChatBackProfile";
			horizSizing = "left";
			vertSizing = "bottom";
			position = netGraphHudFrame.getPosition();
			extent = "170 80";
			minExtent = "2 2";
			visible = "1";
	};
	playgui.add($statusHud);
	new GuiControlProfile ("statusHudTagProfile")
	{
		fontType = "Univers Condensed";
		fontSize = 14;
		fontColor = "200 200 200";
		justify = "center";
	};
	new GuiControlProfile ("statusHudTextProfile")
	{
		fontType = "Univers Condensed";
		fontSize = 14;
		justify = "center";
	};
	statusHudHud.fpscurrenttext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 0";
			extent = "20 16";
			visible = "1";
			text = "fps:";
	};
	statusHudHud.fpscurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "22 0";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.fpsaveragetext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "53 0";
			extent = "20 16";
			visible = "1";
			text = "avg:";
	};
	statusHudHud.fpsaverage = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "73 0";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.fpsmaxtext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "104 0";
			extent = "20 16";
			visible = "1";
			text = "max:";
	};
	statusHudHud.fpsmax = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "125 0";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.pingtext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 16";
			extent = "20 16";
			visible = "1";
			text = "ping:";
	};
	statusHudHud.ping = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "22 16";
			extent = "20 16";
			visible = "1";
			text = $statusHudPing;
	};
	statusHudHud.pltext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "141 16";
			extent = "15 16";
			visible = "1";
			text = "pl:";
	};
	statusHudHud.pl = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "148 16";
			extent = "20 16";
			visible = "1";
			text = $statusHudPL;
	};
	statusHudHud.speedtext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "53 16";
			extent = "28 16";
			visible = "1";
			text = "speed:";
	};
	statusHudHud.speed = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "82 16";
			extent = "24 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.altitudetext = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "105 16";
			extent = "15 16";
			visible = "1";
			text = "alt:";
	};
	statusHudHud.altitude = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "119 16";
			extent = "20 16";
			visible = "1";
			text = "0";
	};
	////////////////////////////////////////////////
	statusHudHud.ppSText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 32";
			extent = "20 16";
			visible = "1";
			text = "ppS:";
	};
	statusHudHud.ppSCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "22 32";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.txText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "53 32";
			extent = "20 16";
			visible = "1";
			text = "Tx:";
	};
	statusHudHud.txCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "66 32";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.rxText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "105 32";
			extent = "20 16";
			visible = "1";
			text = "Rx:";
	};
	statusHudHud.rxCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "118 32";
			extent = "25 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.ppRText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 48";
			extent = "20 16";
			visible = "1";
			text = "ppR:";
	};
	statusHudHud.ppRCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "22 48";
			extent = "20 16";
			visible = "1";
			text = "0";
	};

	statusHudHud.lagMSText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "53 48";
			extent = "34 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.lagMSCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "73 48";
			extent = "24 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.pingAvgText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "105 48";
			extent = "36 16";
			visible = "1";
			text = "pingAvg:";
	};
	statusHudHud.pingAvgCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "137 48";
			extent = "20 16";
			visible = "1";
			text = "0";
	};
	
	
   statusHudHud.pingMinText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 64";
			extent = "34 16";
			visible = "1"; 
			text = "PingMin";
	};
	statusHudHud.pingMinCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "28 64";
			extent = "20 16";
			visible = "1";
			text = "0";
	};

	statusHudHud.pingMaxText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "53 64";
			extent = "34 16";
			visible = "1";
			text = "PingMax";
	};
	statusHudHud.pingMaxCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "80 64";
			extent = "24 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.pingFluxText = new GuiMLTextCtrl() {
			profile = "statusHudTagProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "105 64";
			extent = "36 16";
			visible = "1";
			text = "Flux";
	};
	statusHudHud.pingFluxCurrent = new GuiMLTextCtrl() {
			profile = "statusHudTextProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "124 64";
			extent = "20 16";
			visible = "1";
			text = "0";
	};
	statusHudHud.add(statusHudHud.fpscurrenttext);
	statusHudHud.add(statusHudHud.fpscurrent);
   statusHudHud.fpscurrenttext.setText("fps:");
		
	statusHudHud.add(statusHudHud.fpsaveragetext);
	statusHudHud.add(statusHudHud.fpsaverage);
   statusHudHud.fpsaveragetext.setText("avg:");
		
	statusHudHud.add(statusHudHud.fpsmaxtext);
	statusHudHud.add(statusHudHud.fpsmax);
   statusHudHud.fpsmaxtext.setText("max:");
   
	statusHudHud.add(statusHudHud.pingtext);
	statusHudHud.add(statusHudHud.ping);
   statusHudHud.pingtext.setText("ping:");
		
	statusHudHud.add(statusHudHud.pltext);
	statusHudHud.add(statusHudHud.pl);
   statusHudHud.pltext.setText("pl:");
   
	statusHudHud.add(statusHudHud.speedtext);
	statusHudHud.add(statusHudHud.speed);
   statusHudHud.speedtext.setText("speed:");
		
	statusHudHud.add(statusHudHud.altitudetext);
	statusHudHud.add(statusHudHud.altitude);
   statusHudHud.altitudetext.setText("alt:");
   
	//////////////////////////////////////////////
   statusHudHud.add(statusHudHud.ppSText);
	statusHudHud.add(statusHudHud.ppSCurrent);
   statusHudHud.ppSText.setText("ppS:"); //dcdcdc
	
	statusHudHud.add(statusHudHud.ppRText);
	statusHudHud.add(statusHudHud.ppRCurrent);
   statusHudHud.ppRText.setText("ppR:"); //00bef0
	
	statusHudHud.add(statusHudHud.rxText);
	statusHudHud.rxText.setText("Rx:");//787878
	statusHudHud.add(statusHudHud.rxCurrent);
	
	statusHudHud.add(statusHudHud.txText);
	statusHudHud.add(statusHudHud.txCurrent);
	statusHudHud.txText.setText("Tx:");// 0078aa
	
   statusHudHud.add(statusHudHud.lagMSText);
   statusHudHud.add(statusHudHud.lagMSCurrent);
   statusHudHud.lagMSText.setText("Lag:");
	
	statusHudHud.add(statusHudHud.pingAvgText);
	statusHudHud.add(statusHudHud.pingAvgCurrent);
	statusHudHud.pingAvgText.setText("PingAvg:");

	statusHudHud.add(statusHudHud.pingMinText);
	statusHudHud.add(statusHudHud.pingMinCurrent);
	statusHudHud.pingMinText.setText("PMin:");
	
	statusHudHud.add(statusHudHud.pingMaxText);
   statusHudHud.add(statusHudHud.pingMaxCurrent);
	statusHudHud.pingMaxText.setText("PMax:");
	
	statusHudHud.add(statusHudHud.pingFluxText);
   statusHudHud.add(statusHudHud.pingFluxCurrent);
	statusHudHud.pingFluxText.setText("PDif:");
	statusHudHud.lagMSCurrent.setText(0);
   if(isObject(HM) && isObject(HudMover)) {
		hudmover::addhud(statusHudHud, "statusHud");
	}
}
};
activatePackage(statusHudPackage);
	
	
