<?php
$urls = [
    'FPT' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=FPTShopOnline&format=Atom',
    'HoangHa' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=hoanghamobilecom&format=Atom',
    'TGDD' => 'http://localhost:80/?action=display&bridge=FacebookBridge&context=User&u=thegioididongcom&format=Atom'
];
foreach ($urls as $name => $url) {
    $res = @file_get_contents($url);
    echo "=== $name ===\n";
    $xml = @simplexml_load_string($res);
    if ($xml && isset($xml->entry)) {
        foreach ($xml->entry as $entry) {
            echo "Title: " . (string)$entry->title . "\n";
            echo "Link: " . (string)$entry->link['href'] . "\n";
            echo "Summary: " . substr(strip_tags((string)$entry->content), 0, 150) . "...\n\n";
        }
    } else {
        echo "Failed to parse XML\n";
    }
}
