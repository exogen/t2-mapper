// #autoload
// #name = UEfix
// #version = 1.0
// #date = December 27, 2003
// #category = Fix
// #author = Lou Cypher
// #warrior = LouCypher
// #email = asta_llama_lincoln@hotmail.com
// #web = http://deadzone.cjb.net
// #description = Prevents clients from being vulnerable to crashing via NULL voice exploit

package UEfix {
	function alxGetWaveLen(%wavFile) {
		if ( strstr( %wavFile , ".wav" ) == -1 ) return $MaxMessageWavLength + 1;
		echo("Length check: " @ %wavFile);
		parent::alxGetWaveLen(%wavFile);
	}
};
activatePackage(UEfix);
