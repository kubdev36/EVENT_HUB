<?php
$res = file_get_contents('http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=FPTShopOnline&format=Atom');
$xml = simplexml_load_string($res);
echo "Feed title: " . $xml->title . "\n";
foreach ($xml->entry as $e) {
    echo "published: " . (string)$e->published . "\n";
    echo "updated: " . (string)$e->updated . "\n";
}
