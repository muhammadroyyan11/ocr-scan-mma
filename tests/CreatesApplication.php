<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;

trait CreatesApplication
{
    /**
     * Creates the application.
     */
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';

        $app->loadEnvironmentFrom('.env.testing');

        $app->make(Kernel::class)->bootstrap();

        if (! $app->environment('testing') || $app['config']->get('database.default') !== 'sqlite' || $app['config']->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Unsafe test configuration: SQLite in-memory and testing environment are required.');
        }

        $compiled = sys_get_temp_dir().'/stock-scanner-test-views';
        if (! is_dir($compiled)) {
            mkdir($compiled, 0775, true);
        }
        $app['config']->set('view.compiled', $compiled);

        return $app;
    }
}
