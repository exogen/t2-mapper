
//datablock AudioProfile(TR2TestPrefixSound)
//{
//   filename    = "fx/bonuses/test-Prefix-brilliance.wav";
//   description = AudioBIGExplosion3d;
//   preload = true;
//};

$PrefixList = new ScriptObject() {
   class = PrefixList;
};

function PrefixList::get(%this, %a)
{
   return $PrefixList[%a];
}

// Somewhat backwards
$PrefixList[0] = new ScriptObject() {
   text = "Angled";
   value = 2;
   sound = "blah.wav";
   emitter = "Optional";
   class = PrefixData;
};

// Nearly backwards
$PrefixList[1] = new ScriptObject() {
   text = "Twisted";
   value = 5;
   sound = "blah.wav";
   emitter = "Optional";
   class = PrefixData;
};

// Completely backwards
$PrefixList[2] = new ScriptObject() {
   text = "Deranged";
   value = 8;
   sound = "blah.wav";
   emitter = "Optional";
   class = PrefixData;
};

