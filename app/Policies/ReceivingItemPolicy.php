<?php

namespace App\Policies;

use App\Models\ReceivingItem;
use App\Models\User;

class ReceivingItemPolicy
{
    public function view(User $user, ReceivingItem $item): bool
    {
        return (new ReceivingSessionPolicy)->view($user, $item->session);
    }

    public function update(User $user, ReceivingItem $item): bool
    {
        return (new ReceivingSessionPolicy)->update($user, $item->session);
    }

    public function delete(User $user, ReceivingItem $item): bool
    {
        return $this->update($user, $item);
    }
}
