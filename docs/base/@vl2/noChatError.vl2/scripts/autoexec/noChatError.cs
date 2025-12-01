// Written by LouCypher
package noChatError {
	function IRCClient::notify(%event)
	{
		switch$(%event)
		{
		case IDIRC_ERR_DROPPED:
		case IDIRC_ERR_TIMEOUT:
		case IDIRC_ERROR: return;
		default:
			parent::notify(%event);
		}
	}
};
if (!isActivePackage(noChatError)) activatePackage(noChatError);