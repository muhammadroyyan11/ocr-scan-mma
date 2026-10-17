<?php

namespace App\Http\Controllers;

use App\Models\ReceivingItem;
use App\Models\ReceivingSession;
use Illuminate\Http\Request;

class PageController extends Controller
{
    public function dashboard(Request $request)
    {
        $query = ReceivingSession::accessibleTo($request->user());
        $stats = ['sessions' => (clone $query)->count(), 'open' => (clone $query)->where('status', 'open')->count(), 'items' => ReceivingItem::whereIn('receiving_session_id', (clone $query)->select('id'))->count(), 'review' => ReceivingItem::whereIn('receiving_session_id', (clone $query)->select('id'))->where('verification_status', 'needs_review')->count()];
        $sessions = $query->with('creator:id,name')->withCount('items')->latest('id')->limit(6)->get();

        return view('dashboard', compact('stats', 'sessions'));
    }

    public function scanner(ReceivingSession $session)
    {
        $this->authorize('update', $session);

        return view('scanner', compact('session'));
    }
}
