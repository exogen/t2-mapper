// #name = Muting Tools
// #version = 0.4.1
// #date = April 24, 2001
// #category = Support
// #credit = Robert blanchet (aka xgalaxy)
// #author = Jason "VeKToR" Gill
// #email = xgalaxy@home.com
// #email = vektor@linux.ca
// #warrior = VeKToR++
// #description = Adds functions to help mute messages
// #status = release
// #include = support/callback.cs
// ---------------------------------------------------------------------------

package mutetools
{
	function defaultMessageCallback(%msgType, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10)
	{
		%callbackname = "Callback" @ detag(%msgType);
		callback.trigger(%callbackname, %msgtype, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10);
		
		if(!callback.returned(%callbackname, mute))
			parent::defaultMessageCallback(%msgType, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10);
		
	}
	
	function addMessageHudLine(%text)
	{
		callback.trigger(msgText, %text);
		
		if(!callback.returned(msgText, mute))
			parent::addMessageHudLine(%text);
	}
	
	
};
activatepackage(mutetools);
