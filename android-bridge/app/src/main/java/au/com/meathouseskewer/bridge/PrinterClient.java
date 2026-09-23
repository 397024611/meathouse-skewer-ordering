package au.com.meathouseskewer.bridge;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

final class PrinterClient {
    private static final Charset ENCODING = Charset.forName("GB2312");
    private static final int LINE_WIDTH = 42;

    static void printTest(String host, int port, String label) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        init(b); center(b); bold(b,true); size(b,1,1);
        line(b,"MEAT HOUSE"); line(b,"打印测试 / PRINT TEST");
        size(b,0,0); bold(b,false); line(b,label); line(b,host+":"+port); line(b,"连接正常 / CONNECTION OK"); finish(b);
        send(host,port,b.toByteArray());
    }

    static void printOrder(String host, int port, JSONObject job) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); init(b); center(b); bold(b,true);
        line(b,"MEAT HOUSE"); line(b,"烤 串 单 / SKEWER ORDER"); line(b,"==========================================");

        size(b,1,1); line(b,bilingualTable(job.optString("table_name",""))); size(b,0,0);
        line(b,"第 "+job.optInt("round_no",0)+" 轮 / ROUND "+job.optInt("round_no",0)); line(b,"==========================================");

        left(b); bold(b,false);
        String created=job.optString("created_at",""); String time=created;
        try {time=DateTimeFormatter.ofPattern("hh:mm a").withZone(ZoneId.of("Australia/Sydney")).format(Instant.parse(created));}catch(Exception ignored){}
        line(b,"下单时间 / ORDER TIME  "+time); line(b,"------------------------------------------");

        JSONArray items=job.optJSONArray("items"); int total=0;
        if(items!=null) for(int i=0;i<items.length();i++){
            JSONObject it=items.getJSONObject(i); int qty=it.optInt("qty",0); total+=qty;
            String display=it.optString("display_name",it.optString("name","菜品 / Item"));
            String fallback=it.optString("name","Item");
            String[] names=bilingualNames(display,fallback);
            bold(b,true); line(b,formatColumns(names[0],"× "+qty)); bold(b,false);
            if(!names[1].isEmpty()) line(b,"  "+names[1]);
            if(i<items.length()-1) line(b,"");
        }

        line(b,"------------------------------------------"); bold(b,true); size(b,1,0);
        line(b,formatColumns("总串数 / TOTAL",String.valueOf(total))); size(b,0,0); bold(b,false);
        line(b,"=========================================="); finish(b); send(host,port,b.toByteArray());
    }

    static long probe(String host,int port){
        long start=System.nanoTime();
        try(Socket s=new Socket()){
            s.setTcpNoDelay(true);
            s.connect(new InetSocketAddress(host,port),1200);
            return Math.max(1L,(System.nanoTime()-start)/1000000L);
        }catch(Exception e){return -1L;}
    }

    private static Socket connectWithRetry(String host,int port)throws Exception{
        Exception last=null;
        for(int attempt=1;attempt<=3;attempt++){
            Socket s=new Socket();
            try{
                s.setKeepAlive(true);
                s.setTcpNoDelay(true);
                s.connect(new InetSocketAddress(host,port),2500);
                s.setSoTimeout(5000);
                return s;
            }catch(Exception e){
                last=e;
                try{s.close();}catch(Exception ignored){}
                if(attempt<3){
                    try{Thread.sleep(300L*attempt);}catch(InterruptedException ie){Thread.currentThread().interrupt();throw ie;}
                }
            }
        }
        throw last==null?new java.io.IOException("Unable to connect to printer"):last;
    }

    private static void send(String host,int port,byte[] data)throws Exception{
        if(host==null||host.trim().isEmpty())throw new java.io.IOException("Printer IP missing");
        try(Socket s=connectWithRetry(host.trim(),port)){
            OutputStream out=s.getOutputStream();
            out.write(data);
            out.flush();
        }
    }

    private static String bilingualTable(String raw){
        String s=raw==null?"":raw.trim().toUpperCase();
        if(s.isEmpty()) return "桌号 / TABLE";
        return s+"桌 / TABLE "+s;
    }

    private static String[] bilingualNames(String display,String fallback){
        String zh="", en="";
        String d=display==null?"":display.trim();
        if(d.contains("/")){
            String[] parts=d.split("/",2);String a=parts[0].trim(),c=parts[1].trim();
            if(hasChinese(a)){zh=a;en=c;}else if(hasChinese(c)){zh=c;en=a;}else en=a;
        }else if(hasChinese(d)) zh=d; else en=d;

        String f=fallback==null?"":fallback.trim();
        if((zh.isEmpty()||en.isEmpty())&&f.contains("/")){
            String[] parts=f.split("/",2);String a=parts[0].trim(),c=parts[1].trim();
            if(zh.isEmpty()){if(hasChinese(a))zh=a;else if(hasChinese(c))zh=c;}
            if(en.isEmpty()){if(!hasChinese(a))en=a;else if(!hasChinese(c))en=c;}
        }
        if(en.isEmpty()&&!hasChinese(f)) en=f;
        if(zh.isEmpty()) zh=en.isEmpty()?"菜品":en;
        return new String[]{zh,en};
    }

    private static boolean hasChinese(String s){for(int i=0;i<s.length();i++){char c=s.charAt(i);if(c>=0x4E00&&c<=0x9FFF)return true;}return false;}
    private static String formatColumns(String left,String right){int spaces=Math.max(1,LINE_WIDTH-displayWidth(left)-displayWidth(right));return left+" ".repeat(spaces)+right;}
    private static int displayWidth(String s){int w=0;for(int i=0;i<s.length();i++){char c=s.charAt(i);w+=(c>127?2:1);}return w;}
    private static void init(ByteArrayOutputStream b){b.write(0x1B);b.write(0x40);}
    private static void center(ByteArrayOutputStream b){b.write(0x1B);b.write(0x61);b.write(1);}
    private static void left(ByteArrayOutputStream b){b.write(0x1B);b.write(0x61);b.write(0);}
    private static void bold(ByteArrayOutputStream b,boolean on){b.write(0x1B);b.write(0x45);b.write(on?1:0);}
    private static void size(ByteArrayOutputStream b,int w,int h){b.write(0x1D);b.write(0x21);b.write(((w&7)<<4)|(h&7));}
    private static void line(ByteArrayOutputStream b,String s){try{b.write(s.getBytes(ENCODING));b.write('\n');}catch(Exception ignored){}}
    private static void finish(ByteArrayOutputStream b){b.write('\n');b.write('\n');b.write('\n');b.write(0x1D);b.write(0x56);b.write(1);}
}
