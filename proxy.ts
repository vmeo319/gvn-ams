import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isCoach = profile?.role === 'coach' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'

  // Checked before the general /coach gate below — /admin is a subset of /coach's access
  // requirement (admin implies coach) but strictly narrower, so it needs its own check
  // rather than falling through to isCoach.
  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL('/coach', request.url))
  }

  if (pathname.startsWith('/coach') && !isCoach) {
    return NextResponse.redirect(new URL('/athlete', request.url))
  }

  // Coaches can also view /athlete (their own "Athlete View" of their own metrics),
  // so no redirect away from it for coaches — only athletes are kept out of /coach.

  return response
}

export const config = {
  matcher: ['/coach/:path*', '/athlete/:path*', '/admin/:path*'],
}
