<?php

namespace App\Http\Controllers;

use App\Http\Requests\ItemRequest;
use App\Models\ReceivingItem;
use App\Models\ReceivingSession;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ItemController extends Controller
{
    private function prepare(ItemRequest $request, ?ReceivingItem $item = null): array
    {
        $data = array_replace($item?->only(['mfg_raw', 'mfg_date', 'mfg_month', 'exp_raw', 'exp_date', 'exp_month']) ?? [], Arr::except($request->validated(), ['confirmed', 'scans']));
        foreach (['mfg', 'exp'] as $field) {
            if ($request->filled($field.'_month')) {
                $data[$field.'_date'] = null;
            } elseif ($request->filled($field.'_date')) {
                $data[$field.'_month'] = null;
            }
        }
        foreach (['mfg_date', 'exp_date'] as $field) {
            if (($data[$field] ?? null) instanceof \DateTimeInterface) {
                $data[$field] = $data[$field]->format('Y-m-d');
            }
        }
        $warnings = [];
        foreach (['mfg', 'exp'] as $field) {
            if (! empty($data[$field.'_raw']) && empty($data[$field.'_date']) && empty($data[$field.'_month'])) {
                $data['verification_status'] = 'needs_review';
                $warnings[] = strtoupper($field).' belum memiliki tanggal yang dikonfirmasi; teks mentah dipertahankan.';
            }
        }
        $earliestMfg = $data['mfg_date'] ?? (! empty($data['mfg_month']) ? $data['mfg_month'].'-01' : null);
        $latestExp = $data['exp_date'] ?? (! empty($data['exp_month']) ? $data['exp_month'].'-31' : null);
        if ($earliestMfg && $latestExp && $latestExp < $earliestMfg) {
            $warnings[] = 'EXP lebih awal dari MFG. Periksa label; nilai tidak diubah.';
            $data['verification_status'] = 'needs_review';
        }

        return [$data, $warnings];
    }

    public function store(ItemRequest $request, ReceivingSession $session)
    {
        $this->authorize('update', $session);
        [$data, $warnings] = $this->prepare($request);
        $item = DB::transaction(function () use ($session, $request, $data) {
            $locked = ReceivingSession::lockForUpdate()->findOrFail($session->id);
            $this->authorize('update', $locked);
            $item = $locked->items()->create($data);
            $item->scans()->createMany($request->validated('scans', []));

            return $item->load('scans');
        });

        return response()->json(['data' => $item, 'warnings' => $warnings, 'message' => 'Item disimpan.'], 201);
    }

    public function show(Request $request, ReceivingItem $item)
    {
        $this->authorize('view', $item);
        $item->load('scans', 'session');

        return $request->is('api/*') ? response()->json(['data' => $item, 'message' => 'Detail item.']) : view('items.edit', compact('item'));
    }

    public function update(ItemRequest $request, ReceivingItem $item)
    {
        $this->authorize('update', $item);
        [$data, $warnings] = $this->prepare($request, $item);
        DB::transaction(function () use ($item, $data, $request) {
            $session = ReceivingSession::lockForUpdate()->findOrFail($item->receiving_session_id);
            $this->authorize('update', $session);
            $item->update($data);
            if ($request->has('scans')) {
                $item->scans()->delete();
                $item->scans()->createMany($request->validated('scans', []));
            }
        });

        return response()->json(['data' => $item->fresh()->load('scans'), 'warnings' => $warnings, 'message' => 'Item diperbarui.']);
    }

    public function destroy(ReceivingItem $item)
    {
        $this->authorize('delete', $item);
        DB::transaction(function () use ($item) {
            $session = ReceivingSession::lockForUpdate()->findOrFail($item->receiving_session_id);
            $this->authorize('update', $session);
            $item->delete();
        });

        return response()->json(['data' => null, 'message' => 'Item dihapus.']);
    }
}
