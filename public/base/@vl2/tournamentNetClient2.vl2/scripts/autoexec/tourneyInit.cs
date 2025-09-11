
if (!isObject(ServerGroup))
{
	exec("tournament/settings.cs");
	exec("tournament/login.cs");
	tn_community_login_initiate();
	exec("tournament/browser.cs");
}