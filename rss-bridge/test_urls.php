<?php
$urls = [
    'FPT' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=FPTShopOnline&format=Atom',
    'HoangHa' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=hoanghamobilecom&format=Atom',
    'TGDD' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=thegioididongcom&format=Atom'
];
foreach ($urls as $name => $url) {
    $res = @file_get_contents($url);
    echo "$name: len=" . strlen($res) . " - has entry: " . (strpos($res, '<entry>') !== false ? 'YES' : 'NO') . "\n";
    if (strpos($res, '<entry>') === false) {
        echo " -> Output snippet: " . substr(strip_tags($res), 0, 300) . "\n";
    }
}
