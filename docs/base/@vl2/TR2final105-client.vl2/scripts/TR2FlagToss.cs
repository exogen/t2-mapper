$TR2FGauge::Reset = 3000; // 3 seconds
$TR2FGauge::Duration = 1200; // 1.2 seconds
$TR2FGauge::Increase = 0.01; // 1%
$IHaveFlag = 0;

new GuiControlProfile ("TR2StrengthBar")
{
   opaque = false;
   fillColor = $TR2Pref::FlagToss::FillColor;
   border = true;
   borderColor = $TR2Pref::FlagToss::BorderColor;
};

function doFlagGauge(%val)
{
	if( %val && $IHaveFlag )
	{
		TR2_ThrowStrength.setVisible(1);
		TR2StrengthBar.border = true;
		%level = TR2_ThrowStrength.getValue();
		if( %level < 1 )
		{
			TR2_ThrowStrength.setValue(%level + $TR2FGauge::Increase);
			$TR2FGaugeThread = schedule($TR2FGauge::Duration/100, 0, "doFlagGauge", 1);
		}
		if( !isEventPending($TR2FGauge::HideThread) )
			$TR2FGauge::HideThread = schedule($TR2FGauge::Reset, 0, "hideFlagGauge");
	}
	else
	{
		if( isEventPending($TR2FGauge::HideThread) )
			cancel($TR2FGauge::HideThread);
      hideFlagGauge();
   }
}

function hideFlagGauge()
{
	if( isEventPending($TR2FGaugeThread) )
   	cancel($TR2FGaugeThread);
   $TR2FGaugeThread = 0;
   TR2_ThrowStrength.setVisible(0);
   TR2_ThrowStrength.setValue(0);
   TR2StrengthBar.border = false;
}

function flagTossHandleGrab(%msgType, %msgString, %name, %teamName, %team, %nameBase)
{
	if( strstr(%msgString, "You took the flag." ) >= 0 )
		$IHaveFlag = true;
}

function flagTossHandleDrop(%msgType, %msgString, %teamName, %team)
{
	if( strstr( %msgString, "You dropped the flag." ) >= 0 )
		$IHaveFlag = false;
}


function createFlagTossGauge()
{
	if( !isObject(TR2_ThrowStrength) )
	{
		new GuiProgressCtrl(TR2_ThrowStrength) {
			profile = "TR2StrengthBar";
			horizSizing = "center";
			vertSizing = "relative";
			position = "340 280";
			extent = "100 7";
			minExtent = "8 8";
			visible = "0";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
		};
	}
}


createFlagTossGauge();
PlayGui.add(TR2_ThrowStrength);

addMessageCallback('MsgTR2FlagDropped', flagTossHandleDrop);
addMessageCallback('MsgTR2FlagTaken', flagTossHandleGrab);
